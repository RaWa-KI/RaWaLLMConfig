// update-manager.spec.ts — Verhaltens-Specs fuer den Update-Orchestrator
// (WP20, TEST-MITTEL-03/A2/Owner-Entscheid 3): check/download/install inkl.
// RAWALLM_UPDATE_ENABLED-Gate, backup-first und version-mismatch.
// Electron-Side-Effects via setUpdateMgrDepsForTest gefakt (WP19-Injektion).
// Suite-Invariante: fullyParallel:false (eigener Worker je Spec-Datei);
// update-state ist Modul-Singleton — jeder Test stellt seinen Phase-Vorzustand
// SELBST her (check vor download vor install im Testkoerper), kein
// require-Cache-Hack, keine Reihenfolge-Abhaengigkeit zwischen Tests.
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { makeSandbox, seedFile, type Sandbox } from './fixtures'
import {
  checkForUpdates, downloadUpdate, installUpdate,
  getUpdateState, UPDATE_DISABLED_REASON
} from '../../src/main/services/update-manager'
import {
  setUpdateMgrDepsForTest, type UpdateMgrDeps
} from '../../src/main/services/update-manager-deps'
import { assetSpecFor, currentUpdatePlatform } from '../../src/main/services/update-platform'
import type { UpdateProgressPayload } from '../../shared/contract-updates'

// stageInstaller wartet 100 ms Flush + install-quit haengt an 500-ms-setTimeout.
test.setTimeout(30_000)

const ENV_DIR = 'RAWALLM_UPDATE_DIR'
const ENV_GATE = 'RAWALLM_UPDATE_ENABLED'
const ENV_RELEASE = 'RAWALLM_RELEASE_URL'
let dirBefore: string | undefined
let gateBefore: string | undefined
let releaseBefore: string | undefined

test.beforeEach(() => {
  dirBefore = process.env[ENV_DIR]
  gateBefore = process.env[ENV_GATE]
  releaseBefore = process.env[ENV_RELEASE]
  // Definierter Ausgangszustand: lokale Specs ohne echten HTTPS-Request, Gate default AN.
  delete process.env[ENV_DIR]
  delete process.env[ENV_GATE]
  process.env[ENV_RELEASE] = 'disabled-for-tests'
})
test.afterEach(() => {
  if (dirBefore === undefined) delete process.env[ENV_DIR]
  else process.env[ENV_DIR] = dirBefore
  if (gateBefore === undefined) delete process.env[ENV_GATE]
  else process.env[ENV_GATE] = gateBefore
  if (releaseBefore === undefined) delete process.env[ENV_RELEASE]
  else process.env[ENV_RELEASE] = releaseBefore
  // Deps zurueck auf realDeps (naechster Test setzt seine Fakes selbst).
  setUpdateMgrDepsForTest({})
})

const CURRENT_VERSION = '0.1.0'
const UPDATE_PLATFORM = currentUpdatePlatform()
const PLATFORM_SPEC = assetSpecFor(UPDATE_PLATFORM)
const ASSET_NAME = PLATFORM_SPEC.platform === 'linux' ? 'RaWaLLMConfig.AppImage' : 'RaWa-Setup.exe'
const INSTALLER_CONTENT = PLATFORM_SPEC.platform === 'linux'
  ? '\u007fELF' + 'x'.repeat(4096)
  : 'MZ' + 'x'.repeat(4096)

interface DepsRecorder {
  quitCalled: boolean
  prefsSets: Array<[string, string]>
}

// Sandbox-Temp-Root fuer deps.getTempPath() (staged-Ziel der App).
function tempRoot(sb: Sandbox): string {
  const dir = join(sb.root, 'temp')
  mkdirSync(dir, { recursive: true })
  return dir
}

// Erwarteter staged-Pfad (update-manager: <temp>/RaWaLLMConfig-Updates/<asset>).
function expectedStagedPath(sb: Sandbox): string {
  return join(tempRoot(sb), 'RaWaLLMConfig-Updates', ASSET_NAME)
}

// Fake-Deps installieren; Recorder fuer quit + prefs-Persist zurueckgeben.
function installDeps(sb: Sandbox, over: Partial<UpdateMgrDeps> = {}): DepsRecorder {
  const rec: DepsRecorder = { quitCalled: false, prefsSets: [] }
  setUpdateMgrDepsForTest({
    getVersion: () => CURRENT_VERSION,
    getTempPath: () => tempRoot(sb),
    quit: () => { rec.quitCalled = true },
    exportPrefsSnapshot: () => ({ data: { source: 'prefs', snapshotPath: '' }, error: null }),
    resolvePrefsSet: async (key, val) => { rec.prefsSets.push([key, val]) },
    // verify/run bleiben real (electron-frei) — install-Tests stubben gezielt.
    ...over,
  })
  return rec
}

// Update-Quelle seeden: nativer Fake-Installer + gueltiges latest.json
// (tag v9.9.9, Plattform-Asset mit echter size + sha256) + RAWALLM_UPDATE_DIR setzen.
function seedUpdateSource(sb: Sandbox): { size: number; sha: string } {
  const size = Buffer.byteLength(INSTALLER_CONTENT)
  const sha = createHash('sha256').update(INSTALLER_CONTENT, 'utf8').digest('hex')
  seedFile(sb, ASSET_NAME, INSTALLER_CONTENT)
  seedFile(sb, 'latest.json', JSON.stringify({
    tag_name: 'v9.9.9', name: 'Release 9.9.9', body: 'Notes',
    published_at: '2026-06-10T00:00:00Z', prerelease: false,
    assets: [{
      name: ASSET_NAME, browser_download_url: 'file://audit-only',
      size, sha256: sha,
    }],
  }))
  process.env[ENV_DIR] = sb.configDir
  return { size, sha }
}

// Phase-Vorzustand 'ready' SELBST herstellen: check + download im Testkoerper.
async function reachReady(sb: Sandbox): Promise<void> {
  await checkForUpdates()
  const dl = await downloadUpdate({ version: '9.9.9' }, () => {})
  expect(dl.error).toBe(null)
  expect(getUpdateState().phase).toBe('ready')
}

// --- checkForUpdates ----------------------------------------------------------

test.describe('checkForUpdates', () => {
  test('Default-Quelle ist schon im frischen State konfiguriert', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    delete process.env[ENV_RELEASE]
    const st = getUpdateState()
    expect(st.sourceConfigured).toBe(true)
    expect(st.sourceKind).toBe('https')
    expect(st.sourceLabel).toBe('Öffentliche Releases (GitHub)')
  })

  test('ungueltige Quelle -> sourceConfigured false, kein Update', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    const r = await checkForUpdates()
    expect(r.error).toBe(null)
    expect(r.data?.sourceConfigured).toBe(false)
    expect(r.data?.sourceLabel).toBe('Quelle gerade nicht erreichbar')
    expect(r.data?.hasUpdate).toBe(false)
    expect(r.data?.currentVersion).toBe(CURRENT_VERSION)
    expect(r.data?.latestVersion).toBe(null)
    expect(getUpdateState().phase).toBe('idle')
  })

  test('gueltiges Manifest -> hasUpdate, phase available, History update-available', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    seedUpdateSource(sb)
    const r = await checkForUpdates()
    expect(r.error).toBe(null)
    expect(r.data?.hasUpdate).toBe(true)
    expect(r.data?.sourceConfigured).toBe(true)
    expect(r.data?.latestVersion).toBe('9.9.9')
    expect(r.data?.info?.assetName).toBe(ASSET_NAME)
    const st = getUpdateState()
    expect(st.phase).toBe('available')
    expect(st.latestVersion).toBe('9.9.9')
    expect(st.sourceLabel).toBe('Lokaler Update-Ordner')
    expect(st.releaseNotes).toBe('Notes')
    expect(st.history.some((h) => h.event === 'update-available')).toBe(true)
  })

  test('kaputtes Manifest -> kein Update, sourceConfigured true, kein error nach aussen', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    seedFile(sb, 'latest.json', '{ kaputt ohne quotes')
    process.env[ENV_DIR] = sb.configDir
    const r = await checkForUpdates()
    expect(r.error).toBe(null)
    expect(r.data?.hasUpdate).toBe(false)
    expect([r.data?.sourceConfigured, r.data?.lastSourceError]).toEqual([true, 'Quelle gerade nicht erreichbar'])
    expect(r.data?.latestVersion).toBe('9.9.9')
    expect(getUpdateState().phase).toBe('idle')
  })
})

test.describe('Update-Manager UI-Texte', () => {
  test('Leerzustand zeigt keine internen Env-Namen', () => {
    const panelPath = join(process.cwd(), 'src/renderer/sections/updates/UpdateManagerPanel.tsx')
    const panel = readFileSync(panelPath, 'utf8')
    expect(panel).not.toContain('RAWALLM_UPDATE_DIR')
    expect(panel).not.toContain('RAWALLM_RELEASE_URL')
    expect(panel).toContain('Quelle gerade nicht erreichbar')
  })
})

// --- downloadUpdate -----------------------------------------------------------

test.describe('downloadUpdate', () => {
  test('version-mismatch: angefragte Version != latestVersion -> Fehler, kein data', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    seedUpdateSource(sb)
    await checkForUpdates() // Vorzustand selbst herstellen (latestVersion 9.9.9)
    const r = await downloadUpdate({ version: '1.0.0' }, () => {})
    expect(r.data).toBe(null)
    expect(r.error).toBe('version-mismatch')
  })

  test('Happy-Path: staged unter Temp, sha256Verified, phase ready, Progress 100, previousVersion persistiert', async () => {
    const sb = makeSandbox()
    const rec = installDeps(sb)
    const { size } = seedUpdateSource(sb)
    await checkForUpdates()
    const progress: UpdateProgressPayload[] = []
    const r = await downloadUpdate({ version: '9.9.9' }, (p) => progress.push(p))
    expect(r.error).toBe(null)
    expect(r.data?.assetName).toBe(ASSET_NAME)
    expect(r.data?.stagedPath).toBe(expectedStagedPath(sb))
    expect(existsSync(expectedStagedPath(sb))).toBe(true)
    expect(r.data?.fileSize).toBe(size)
    expect(r.data?.sha256Verified).toBe(true)
    expect(r.data?.previousVersion).toBe(CURRENT_VERSION)
    expect(getUpdateState().phase).toBe('ready')
    expect(progress.length).toBeGreaterThan(0)
    expect(progress[progress.length - 1].percentage).toBe(100)
    // previousVersion via Deps-Recorder persistiert (resolvePrefsSet).
    expect(rec.prefsSets).toContainEqual(['updates.previousVersion', CURRENT_VERSION])
  })

  test('archive-missing: Abbruch VOR stageInstaller mit Fehlertext, kein staged File', async () => {
    const sb = makeSandbox()
    installDeps(sb, {
      exportPrefsSnapshot: () => ({ data: null, error: 'archive-missing' }),
    })
    seedUpdateSource(sb)
    await checkForUpdates()
    const r = await downloadUpdate({ version: '9.9.9' }, () => {})
    expect(r.data).toBe(null)
    expect(r.error).toBe('Archiv-Root fehlt')
    // Abbruch vor stageInstaller: kein Installer im Staging-Ziel.
    expect(existsSync(expectedStagedPath(sb))).toBe(false)
  })
})

// --- installUpdate ------------------------------------------------------------

test.describe('installUpdate', () => {
  test('Gate AUS -> exakt UPDATE_DISABLED_REASON (Import, kein String-Duplikat)', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    process.env[ENV_GATE] = '0'
    const r = await installUpdate({})
    expect(r.data).toBe(null)
    expect(r.error).toBe(UPDATE_DISABLED_REASON)
    // Die neue Botschaft nennt die Env-Variable (WP19-M1-Ersatz).
    expect(r.error).toContain('RAWALLM_UPDATE_ENABLED')
  })

  test('Gate default AN, aber phase != ready -> kein-Installer-bereit', async () => {
    const sb = makeSandbox()
    installDeps(sb)
    seedUpdateSource(sb)
    await checkForUpdates() // Vorzustand: phase 'available', nicht 'ready'
    delete process.env[ENV_GATE]
    const r = await installUpdate({})
    expect(r.data).toBe(null)
    expect(r.error).toBe('kein-Installer-bereit')
  })

  test('Gate AN + ready + run-Stub -> spawned true UND quit nach ~500 ms (Polling)', async () => {
    const sb = makeSandbox()
    const rec = installDeps(sb, {
      run: async () => ({ spawned: true, error: null }), // KEIN echter Spawn im Unit-Lauf
    })
    seedUpdateSource(sb)
    await reachReady(sb) // verify laeuft real gegen das native staged Asset
    process.env[ENV_GATE] = '1'
    const r = await installUpdate({ silent: true })
    expect(r.error).toBe(null)
    expect(r.data?.spawned).toBe(true)
    expect(r.data?.willQuit).toBe(true)
    // quit haengt am 500-ms-setTimeout — via Polling bis 1,5 s pruefen (kein Race).
    const t0 = Date.now()
    while (!rec.quitCalled && Date.now() - t0 < 1_500) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(rec.quitCalled).toBe(true)
  })

  test('verify-Fail -> Fehler durchgereicht, run wird NIE aufgerufen', async () => {
    const sb = makeSandbox()
    let runCalled = false
    installDeps(sb, {
      verify: () => ({ valid: false, error: 'verify-stub-fail' }),
      run: async () => { runCalled = true; return { spawned: true, error: null } },
    })
    seedUpdateSource(sb)
    await reachReady(sb)
    process.env[ENV_GATE] = '1'
    const r = await installUpdate({})
    expect(r.data).toBe(null)
    expect(r.error).toBe('verify-stub-fail')
    expect(runCalled).toBe(false)
    expect(getUpdateState().phase).toBe('error')
  })
})
