/**
 * update-source-local.ts — Lokaler fs-Transport + transport-unabhaengige Gates.
 * SRP: Manifest lesen, Versionen vergleichen, Installer staged kopieren.
 * Kein Electron-Singleton (kein app/prefs/spawn) — vollstaendig testbar.
 */

import { existsSync, statSync, createReadStream, createWriteStream, readFileSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import type { UpdateRelease, UpdateInfo, UpdateAsset } from '@shared/contract-updates'
import type {
  StageInstallerOpts,
  StageResult,
  UpdateSourceDescription,
  UpdateSourceManifestResult,
  UpdateSourcePort,
  UpdateStageRequest,
} from './update-source-port'
import { checkMzHeader, checkExactSize, sha256Hex, moveToFailed } from './update-gates'
import { isPathWithin } from '../lib/path-within'

export type { StageInstallerOpts, StageResult } from './update-source-port'

export const UPDATE_CONSTANTS = {
  MAX_INSTALLER_SIZE: 200 * 1024 * 1024, // 200 MB Info-Guard
  COPY_FLUSH_DELAY_MS: 100,              // Race-Guard nach Copy (1:1 RawaLite)
} as const

function isWithinBase(base: string, target: string): boolean {
  return isPathWithin(base, target, { includeEqual: true })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getUpdateDir(): string | null {
  const v = process.env.RAWALLM_UPDATE_DIR?.trim()
  return v && v.length > 0 ? v : null
}

export function isValidReleaseShape(v: unknown): v is UpdateRelease {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  if (typeof r['tag_name'] !== 'string') return false
  if (!Array.isArray(r['assets'])) return false
  for (const a of r['assets'] as unknown[]) {
    if (!a || typeof a !== 'object') return false
    const asset = a as Record<string, unknown>
    if (typeof asset['name'] !== 'string') return false
    if (typeof asset['size'] !== 'number') return false
  }
  return true
}

export function readManifest(
  updateDir: string
): { release: UpdateRelease | null; error: string | null } {
  const manifestPath = join(updateDir, 'latest.json')
  if (!existsSync(manifestPath)) {
    return { release: null, error: 'Manifest nicht gefunden' }
  }
  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!isValidReleaseShape(parsed)) {
      return { release: null, error: 'Manifest ungueltig' }
    }
    // prerelease-Default: false wenn fehlt oder kein boolean
    const release: UpdateRelease = {
      ...parsed,
      prerelease: typeof parsed.prerelease === 'boolean' ? parsed.prerelease : false,
    }
    return { release, error: null }
  } catch {
    return { release: null, error: 'Manifest konnte nicht gelesen werden' }
  }
}

export function compareVersions(a: string, b: string): number {
  const partsA = a.replace(/^v/i, '').split('.')
  const partsB = b.replace(/^v/i, '').split('.')
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const na = parseInt(partsA[i] ?? '0', 10)
    const nb = parseInt(partsB[i] ?? '0', 10)
    if (isNaN(na) || isNaN(nb)) {
      // Fallback: localeCompare (wie RawaLite)
      return (partsA[i] ?? '').localeCompare(partsB[i] ?? '')
    }
    if (na !== nb) return na - nb
  }
  return 0
}

export function selectAsset(assets: UpdateAsset[]): UpdateAsset | null {
  return (
    assets.find(
      (a) =>
        typeof a.name === 'string' &&
        (a.content_type === 'application/x-msdownload' ||
          a.name.toLowerCase().endsWith('.exe'))
    ) ?? null
  )
}

export function buildUpdateInfo(
  release: UpdateRelease,
  currentVersion: string
): { hasUpdate: boolean; info: UpdateInfo | null; latestVersion: string | null } {
  // Pre-release-Gate
  if (release.prerelease) {
    return { hasUpdate: false, info: null, latestVersion: null }
  }
  const latestVersion = release.tag_name.replace(/^v/i, '')
  const cmp = compareVersions(latestVersion, currentVersion.replace(/^v/i, ''))
  if (cmp <= 0) {
    return { hasUpdate: false, info: null, latestVersion }
  }
  const asset = selectAsset(release.assets)
  if (!asset) {
    return { hasUpdate: false, info: null, latestVersion }
  }
  const info: UpdateInfo = {
    version: latestVersion,
    name: release.name,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
    assetName: basename(asset.name), // path.basename()-Normalisierung
    fileSize: asset.size,
    isPrerelease: release.prerelease,
    sha256: asset.sha256,
  }
  return { hasUpdate: true, info, latestVersion }
}

function stageError(error: string): StageResult {
  return { ok: false, sha256Verified: false, error }
}

function validateSourceFile(srcExe: string): StageResult | null {
  if (!existsSync(srcExe) || !statSync(srcExe).isFile()) {
    return stageError('source-missing')
  }
  return null
}

function validateDestPath(destPath: string): StageResult | null {
  const destDir = dirname(destPath)
  if (!isWithinBase(destDir, destPath)) {
    return stageError('Ungültiger Zielpfad')
  }
  return null
}

function warnIfInstallerOversize(fileSize: number): void {
  if (fileSize > UPDATE_CONSTANTS.MAX_INSTALLER_SIZE) {
    console.error('[update-source-local] Installer-Groesse ueberschreitet Limit (Info)')
  }
}

function progressTransform(
  total: number,
  onProgress?: (copied: number, total: number) => void
): Transform {
  let copied = 0
  return new Transform({
    transform(chunk, _enc, cb) {
      copied += chunk.length
      onProgress?.(copied, total)
      cb(null, chunk)
    },
  })
}

async function copyInstallerFile(
  srcExe: string,
  destPath: string,
  total: number,
  onProgress?: (copied: number, total: number) => void
): Promise<StageResult | null> {
  try {
    await pipeline(
      createReadStream(srcExe),
      progressTransform(total, onProgress),
      createWriteStream(destPath)
    )
    return null
  } catch {
    moveToFailed(destPath)
    return stageError('Kopieren fehlgeschlagen')
  }
}

function validateCopiedInstaller(destPath: string, fileSize: number): StageResult | null {
  if (!checkMzHeader(destPath)) {
    moveToFailed(destPath)
    return stageError('invalid-installer')
  }
  if (!checkExactSize(destPath, fileSize)) {
    moveToFailed(destPath)
    return stageError('Groesse stimmt nicht ueberein')
  }
  return null
}

async function verifyOptionalSha(destPath: string, sha256?: string): Promise<StageResult | null> {
  if (!sha256) return null
  try {
    const hash = await sha256Hex(destPath)
    if (hash.toLowerCase() !== sha256.toLowerCase()) {
      moveToFailed(destPath)
      return stageError('Pruefsumme stimmt nicht ueberein')
    }
    return null
  } catch {
    moveToFailed(destPath)
    return stageError('Pruefsumme konnte nicht berechnet werden')
  }
}

export async function stageInstaller(opts: StageInstallerOpts): Promise<StageResult> {
  const { updateDir, info, destPath, onProgress } = opts
  const srcExe = join(updateDir, basename(info.assetName))

  const sourceErr = validateSourceFile(srcExe)
  if (sourceErr) return sourceErr
  const destErr = validateDestPath(destPath)
  if (destErr) return destErr
  warnIfInstallerOversize(info.fileSize)

  const copyErr = await copyInstallerFile(srcExe, destPath, info.fileSize, onProgress)
  if (copyErr) return copyErr
  await delay(UPDATE_CONSTANTS.COPY_FLUSH_DELAY_MS)

  const installerErr = validateCopiedInstaller(destPath, info.fileSize)
  if (installerErr) return installerErr
  const shaErr = await verifyOptionalSha(destPath, info.sha256)
  if (shaErr) return shaErr

  return { ok: true, sha256Verified: Boolean(info.sha256), error: null }
}

export class LocalUpdateSource implements UpdateSourcePort {
  readonly kind = 'local' as const

  constructor(private readonly updateDir: string | null = getUpdateDir()) {}

  describe(): UpdateSourceDescription {
    return { kind: this.kind, configured: this.updateDir !== null }
  }

  readManifest(): UpdateSourceManifestResult {
    if (!this.updateDir) {
      return { release: null, error: null, sourceConfigured: false }
    }
    return { ...readManifest(this.updateDir), sourceConfigured: true }
  }

  stageInstaller(opts: UpdateStageRequest): Promise<StageResult> {
    if (!this.updateDir) return Promise.resolve(stageError('source-not-configured'))
    return stageInstaller({ ...opts, updateDir: this.updateDir })
  }
}

export function createLocalUpdateSource(updateDir: string | null = getUpdateDir()): UpdateSourcePort {
  return new LocalUpdateSource(updateDir)
}

// Re-exportieren fuer Konsumenten (damit nur ein Import noetig ist)
export { checkMzHeader, checkExactSize, sha256Hex } from './update-gates'
