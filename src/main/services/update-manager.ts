/**
 * update-manager.ts — Stateful Orchestrator fuer den lokalen Update-Zyklus.
 * SRP: check → download → install koordinieren. Electron-/Side-Effect-Zugriffe
 * (app, backup, prefs, installer) laufen via update-manager-deps.getDeps() —
 * das Modul ist dadurch unter dem Node-Runner importier- und testbar.
 * Sanitisiertes Logging + History.
 * HR27: < 300 Z, Funktionen < 50 Z.
 * State-Struct/-Mutations: update-state.ts (§3.2 build-spec Split).
 */

import { join, basename } from 'node:path'
import { mkdirSync } from 'node:fs'

import type {
  UpdateCheckResult,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateInfo,
  UpdateInstallRequest,
  UpdateInstallResult,
  UpdateProgressPayload,
  UpdateStateData,
} from '@shared/contract-updates'

import { isPathWithin } from '../lib/path-within'
import { resolveUpdateSource } from './update-config'
import { buildUpdateInfo } from './update-source-local'
import type { UpdateSourcePort } from './update-source-port'
import { getDeps } from './update-manager-deps'
import { finalizeDownload, requireReadyIntegrity, stageUpdateInstaller } from './update-download-flow'
import {
  getUpdateState as getStateSnapshot, pushHistory, setPhase, setError,
  clearError, setAvailable, clearKnownRelease, markPreviousVersion, setNoPlatformAsset,
} from './update-state'
import { currentUpdateState, syncUpdateSource, updateCheckPayload } from './update-source-state'

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

export const UPDATE_DISABLED_REASON =
  'Update-Installation ist deaktiviert — RAWALLM_UPDATE_ENABLED=0 entfernen oder auf 1 setzen und App neu starten'

let checkPromise: Promise<UpdateCheckResult> | null = null

// Teilplan B: kurzlebiger Ergebnis-Cache (Default-TTL 60 s) fuer erfolgreiche
// Checks. updatesCheck kostete profiliert 1,5–6,5 s (Netz/Manifest-Zugriff) und
// ist der teuerste IPC-Call. Nur erfolgreiche Ergebnisse (error === null) werden
// gecacht — ein Fehler wird beim naechsten Aufruf frisch erneut versucht.
// force (explizite Nutzer-Aktion) umgeht den Cache; die in-flight-Dedup bleibt.
const CHECK_CACHE_DEFAULT_TTL_MS = 60_000
let checkCacheTtlMs = CHECK_CACHE_DEFAULT_TTL_MS
let lastCheck: { at: number; result: UpdateCheckResult } | null = null

/** Test-Hooks: Cache-Zustand zuruecksetzen / TTL verkleinern (Suite-Pinning). */
export function resetUpdateCheckCacheForTest(): void {
  lastCheck = null
  checkCacheTtlMs = CHECK_CACHE_DEFAULT_TTL_MS
}

export function setUpdateCheckCacheTtlForTest(ms: number): void {
  checkCacheTtlMs = ms
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function parseFlag(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true'
}

/** Gate zur AUFRUFZEIT lesen (testbar ohne require-Cache-Tricks, §3.8 + R10). */
function isUpdateEnabled(): boolean {
  const value = process.env.RAWALLM_UPDATE_ENABLED
  if (value === undefined || value.trim() === '') return true
  return parseFlag(value)
}

// Gleichheit (base === target) zaehlt als innerhalb -> includeEqual=true.
function isWithinBase(base: string, target: string): boolean {
  return isPathWithin(base, target, { includeEqual: true })
}

function getUpdateSource(): UpdateSourcePort {
  return resolveUpdateSource()
}

export function getUpdateState(): UpdateStateData {
  return currentUpdateState(getUpdateSource())
}

/** Pre-Snapshot der prefs-Datei (HR7). Gibt Fehlerstring oder null zurueck. */
function snapshotPrefs(): string | null {
  const snap = getDeps().exportPrefsSnapshot()
  if (snap.error === 'archive-missing') return 'Archiv-Root fehlt'
  if (snap.error) return 'Backup fehlgeschlagen'
  return null
}

// ---------------------------------------------------------------------------
// checkForUpdates
// ---------------------------------------------------------------------------

/** Innere Pruef-Logik (extrahiert fuer HR27-Funktionslimit). */
async function runCheck(): Promise<UpdateCheckResult> {
  const deps = getDeps()
  setPhase('checking')
  clearError()
  setNoPlatformAsset(false)

  const source = getUpdateSource()
  syncUpdateSource(source, deps.getVersion())
  const manifest = await source.readManifest()
  if (!manifest.sourceConfigured) {
    setPhase('idle')
    clearKnownRelease()
    return { data: updateCheckPayload(getUpdateState(), false, null), error: null }
  }

  syncUpdateSource(source, deps.getVersion())
  if (manifest.error || !manifest.release) {
    setPhase('idle')
    syncUpdateSource(source, deps.getVersion(), manifest.error ? 'Quelle gerade nicht erreichbar' : null)
    return { data: updateCheckPayload(getUpdateState(), false, null), error: null }
  }

  const { hasUpdate, info, latestVersion, noPlatformAsset } = buildUpdateInfo(manifest.release, deps.getVersion())
  setAvailable(
    latestVersion ?? '',
    info?.assetName ?? null,
    info?.releaseNotes ?? manifest.release.body ?? null,
    noPlatformAsset
  )
  setPhase(hasUpdate ? 'available' : 'idle')
  pushHistory(noPlatformAsset ? 'no-platform-asset' : hasUpdate ? 'update-available' : 'up-to-date')

  return { data: updateCheckPayload(getUpdateState(), hasUpdate, info ?? null), error: null }
}

/** Check mit Dedup (genau ein in-flight Promise — 1:1 RawaLite) + TTL-Cache. */
export async function checkForUpdates(options?: { force?: boolean }): Promise<UpdateCheckResult> {
  if (checkPromise) return checkPromise
  if (!options?.force && lastCheck && Date.now() - lastCheck.at < checkCacheTtlMs) {
    return lastCheck.result
  }
  checkPromise = runCheck()
    .then((result) => {
      if (!result.error) lastCheck = { at: Date.now(), result }
      return result
    })
    .catch(() => {
      setError('Update-Pruefung fehlgeschlagen')
      console.error('[update-manager] checkForUpdates fehlgeschlagen')
      return { data: null, error: 'Update-Pruefung fehlgeschlagen' } as UpdateCheckResult
    })
    .finally(() => { checkPromise = null })
  return checkPromise
}

// ---------------------------------------------------------------------------
// downloadUpdate — Hilfsfunktionen
// ---------------------------------------------------------------------------

interface DownloadReady {
  source: UpdateSourcePort
  freshInfo: UpdateInfo
  destPath: string
}

/** Gates + Manifest-Reload + Dest-Pfad ermitteln. Null bei Fehler (Error bereits gesetzt). */
async function prepareDownload(
  req: UpdateDownloadRequest
): Promise<DownloadReady | { data: null; error: string }> {
  const st = getStateSnapshot()
  if (st.phase === 'downloading') return { data: null, error: 'busy' }
  if (!st.latestVersion || req.version !== st.latestVersion) {
    return { data: null, error: 'version-mismatch' }
  }
  const source = getUpdateSource()
  const manifest = await source.readManifest()
  if (!manifest.sourceConfigured) return { data: null, error: 'source-not-configured' }
  if (!manifest.release) return { data: null, error: 'Manifest nicht lesbar' }
  const { info: freshInfo } = buildUpdateInfo(manifest.release, getDeps().getVersion())
  if (!freshInfo) return { data: null, error: 'Manifest nicht lesbar' }
  const updatesTempRoot = join(getDeps().getTempPath(), 'RaWaLLMConfig-Updates')
  mkdirSync(updatesTempRoot, { recursive: true })
  const destPath = join(updatesTempRoot, basename(freshInfo.assetName))
  if (!isWithinBase(updatesTempRoot, destPath)) {
    return { data: null, error: 'Ungültiger Zielpfad' }
  }
  return { source, freshInfo, destPath }
}

/** Pre-Snapshot + previousVersion-Persist. Gibt Fehlerstring oder null zurueck. */
async function snapshotAndPersist(): Promise<string | null> {
  const snapErr = snapshotPrefs()
  if (snapErr) return snapErr
  const deps = getDeps()
  try {
    await deps.resolvePrefsSet('updates.previousVersion', deps.getVersion())
    markPreviousVersion(deps.getVersion())
  } catch {
    console.error('[update-manager] previousVersion-Persist fehlgeschlagen')
    // Nicht fatal — Copy laeuft weiter.
  }
  return null
}

// ---------------------------------------------------------------------------
// downloadUpdate
// ---------------------------------------------------------------------------

export async function downloadUpdate(
  req: UpdateDownloadRequest,
  onProgress: (p: UpdateProgressPayload) => void
): Promise<UpdateDownloadResult> {
  const prep = await prepareDownload(req)
  if ('error' in prep && prep.data === null) {
    return prep as UpdateDownloadResult
  }
  const { source, freshInfo, destPath } = prep as DownloadReady

  setPhase('downloading')

  // Pre-Snapshot (HR7) + previousVersion-Persist.
  const persistErr = await snapshotAndPersist()
  if (persistErr) {
    setError(persistErr)
    console.error('[update-manager] archive-missing — Download abgebrochen')
    return { data: null, error: persistErr }
  }

  const stage = await stageUpdateInstaller({ source, freshInfo, destPath, onProgress })
  if (!('sha256Verified' in stage)) return stage

  const readyErr = requireReadyIntegrity(source, stage.sha256Verified)
  if (readyErr) {
    setError(readyErr)
    console.error('[update-manager] HTTPS-Ready-Gate:', readyErr)
    return { data: null, error: readyErr }
  }

  return finalizeDownload(freshInfo, destPath, stage.sha256Verified)
}

// ---------------------------------------------------------------------------
// installUpdate
// ---------------------------------------------------------------------------

export async function installUpdate(req: UpdateInstallRequest): Promise<UpdateInstallResult> {
  // Gate: Installation standardmaessig an; RAWALLM_UPDATE_ENABLED=0 deaktiviert.
  if (!isUpdateEnabled()) {
    return { data: null, error: UPDATE_DISABLED_REASON }
  }

  const st = getStateSnapshot()
  if (st.phase !== 'ready' || !st.stagedPath) {
    return { data: null, error: 'kein-Installer-bereit' }
  }

  const deps = getDeps()
  const verify = deps.verify(st.stagedPath)
  if (!verify.valid) {
    setError(verify.error ?? 'Installer-Verifizierung fehlgeschlagen')
    return { data: null, error: verify.error ?? 'Installer-Verifizierung fehlgeschlagen' }
  }

  setPhase('installing')
  const silent = req.silent !== false

  try {
    const run = await deps.run(st.stagedPath, { silent })
    if (!run.spawned) {
      setError(run.error ?? 'Installer-Start fehlgeschlagen')
      return { data: null, error: run.error ?? 'Installer-Start fehlgeschlagen' }
    }

    pushHistory('installer-spawned')
    // R2: erst spawn bestaetigen, dann quit (Child muss Parent-Exit ueberleben).
    setTimeout(() => { deps.quit() }, 500)

    return { data: { spawned: true, willQuit: true }, error: null }
  } catch {
    setError('Installer-Start fehlgeschlagen')
    console.error('[update-manager] installUpdate fehlgeschlagen')
    return { data: null, error: 'Installer-Start fehlgeschlagen' }
  }
}
