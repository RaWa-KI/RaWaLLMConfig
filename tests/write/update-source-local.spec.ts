// update-source-local.spec.ts — Verhaltens-Specs fuer den lokalen
// Update-Transport (WP18, TEST-MITTEL-03/A2): Env-Quelle, Manifest-Parsing,
// Versionsvergleich, Asset-Wahl, UpdateInfo-Bau, stageInstaller-Gates E2E.
// Electron-frei, nur tmp-Sandbox. Suite laeuft fullyParallel:false (eigener
// Worker je Spec-Datei); Env-Mutationen werden je Test in afterEach
// restauriert — kein geteilter Zustand mit anderen Spec-Dateien.
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { makeSandbox, seedFile, type Sandbox } from './fixtures'
import {
  getUpdateDir, readManifest, compareVersions, selectAsset, buildUpdateInfo,
  stageInstaller, UPDATE_CONSTANTS
} from '../../src/main/services/update-source-local'
import type { UpdateRelease, UpdateAsset, UpdateInfo } from '../../shared/contract-updates'

// stageInstaller wartet COPY_FLUSH_DELAY_MS (100 ms) nach jeder Copy — Tests
// nicht mit engen Timeouts schneiden (Plan-Fallstrick WP18 Schritt 5).
const FLUSH = UPDATE_CONSTANTS.COPY_FLUSH_DELAY_MS
test.setTimeout(30_000 + FLUSH)

// --- Helpers (nur Testdaten, kein Prod-Verhalten nachgebaut) ----------------

function makeAsset(over: Partial<UpdateAsset> = {}): UpdateAsset {
  return { name: 'RaWa-Setup.exe', browser_download_url: 'file://audit-only', size: 102, ...over }
}

function makeRelease(over: Partial<UpdateRelease> = {}): UpdateRelease {
  return {
    tag_name: 'v2.0.0', name: 'Release 2.0.0', body: 'Notes',
    published_at: '2026-06-10T00:00:00Z', prerelease: false,
    assets: [makeAsset()], ...over
  }
}

function makeInfo(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: '2.0.0', name: 'Release 2.0.0', releaseNotes: '',
    publishedAt: '2026-06-10T00:00:00Z', assetName: 'RaWa-Setup.exe',
    fileSize: 102, isPrerelease: false, ...over
  }
}

// Fake-Installer in der Sandbox seeden; liefert Pfad, Bytegroesse und SHA-256.
function seedInstaller(sb: Sandbox, name: string, content: string): { size: number; sha: string } {
  seedFile(sb, name, content)
  return {
    size: Buffer.byteLength(content),
    sha: createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex')
  }
}

// Ziel-Pfad fuer staged Copy in eigenem Sandbox-Unterordner.
function stagedDest(sb: Sandbox): string {
  const dir = join(sb.root, 'staged')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'app-setup.exe')
}

// --- getUpdateDir (Env je Test restaurieren) --------------------------------

const ENV_KEY = 'RAWALLM_UPDATE_DIR'
let envBefore: string | undefined

test.beforeEach(() => { envBefore = process.env[ENV_KEY] })
test.afterEach(() => {
  if (envBefore === undefined) delete process.env[ENV_KEY]
  else process.env[ENV_KEY] = envBefore
})

test.describe('getUpdateDir', () => {
  test('gesetzte Env -> getrimmter Wert', () => {
    process.env[ENV_KEY] = '  C:\\updates\\rawallm  '
    expect(getUpdateDir()).toBe('C:\\updates\\rawallm')
  })

  test('fehlende Env -> null', () => {
    delete process.env[ENV_KEY]
    expect(getUpdateDir()).toBe(null)
  })

  test('Whitespace-only Env -> null', () => {
    process.env[ENV_KEY] = '   '
    expect(getUpdateDir()).toBe(null)
  })
})

// --- readManifest ------------------------------------------------------------

test.describe('readManifest', () => {
  test('fehlendes latest.json -> release null + Fehler', () => {
    const sb = makeSandbox()
    const r = readManifest(sb.configDir)
    expect(r.release).toBe(null)
    expect(r.error).toBe('Manifest nicht gefunden')
  })

  test('kaputtes JSON -> release null + Lesefehler', () => {
    const sb = makeSandbox()
    seedFile(sb, 'latest.json', '{ tag_name: kaputt ohne quotes')
    const r = readManifest(sb.configDir)
    expect(r.release).toBe(null)
    expect(r.error).toBe('Manifest konnte nicht gelesen werden')
  })

  test('Shape-Verletzung tag_name (kein string) -> ungueltig', () => {
    const sb = makeSandbox()
    seedFile(sb, 'latest.json', JSON.stringify({ tag_name: 2, assets: [] }))
    const r = readManifest(sb.configDir)
    expect(r.release).toBe(null)
    expect(r.error).toBe('Manifest ungueltig')
  })

  test('Shape-Verletzung assets (Eintrag ohne number-size) -> ungueltig', () => {
    const sb = makeSandbox()
    seedFile(sb, 'latest.json', JSON.stringify({
      tag_name: 'v1.0.0', assets: [{ name: 'a.exe', size: '102' }]
    }))
    const r = readManifest(sb.configDir)
    expect(r.release).toBe(null)
    expect(r.error).toBe('Manifest ungueltig')
  })

  test('fehlendes prerelease-Feld -> Default false', () => {
    const sb = makeSandbox()
    seedFile(sb, 'latest.json', JSON.stringify({
      tag_name: 'v1.2.3', assets: [{ name: 'a.exe', size: 5 }]
    }))
    const r = readManifest(sb.configDir)
    expect(r.error).toBe(null)
    expect(r.release?.prerelease).toBe(false)
    expect(r.release?.tag_name).toBe('v1.2.3')
  })
})

// --- compareVersions ----------------------------------------------------------

test.describe('compareVersions', () => {
  test('v-Praefix wird gestrippt (v2.0.0 == 2.0.0)', () => {
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0)
    expect(compareVersions('V2.0.0', 'v1.9.9')).toBeGreaterThan(0)
  })

  test('ungleiche Segmentlaenge: fehlende Segmente zaehlen als 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0)
  })

  test('numerischer Vergleich, kein String-Vergleich (1.10 > 1.9)', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0)
  })

  test('nicht-numerische Segmente -> localeCompare-Fallback', () => {
    expect(compareVersions('1.0.alpha', '1.0.beta')).toBeLessThan(0)
    expect(compareVersions('1.0.beta', '1.0.alpha')).toBeGreaterThan(0)
  })
})

// --- selectAsset ----------------------------------------------------------------

test.describe('selectAsset', () => {
  test('Treffer ueber content_type application/x-msdownload', () => {
    const a = makeAsset({ name: 'installer.bin', content_type: 'application/x-msdownload' })
    expect(selectAsset([makeAsset({ name: 'notes.zip' }), a])).toBe(a)
  })

  test('Treffer ueber .exe-Endung (case-insensitive)', () => {
    const a = makeAsset({ name: 'RaWa-Setup.EXE' })
    expect(selectAsset([makeAsset({ name: 'archive.zip' }), a])).toBe(a)
  })

  test('kein exe-Asset -> null', () => {
    expect(selectAsset([makeAsset({ name: 'a.zip' }), makeAsset({ name: 'b.tar.gz' })])).toBe(null)
  })
})

// --- buildUpdateInfo --------------------------------------------------------------

test.describe('buildUpdateInfo', () => {
  test('prerelease-Gate: kein Update, latestVersion null', () => {
    const r = buildUpdateInfo(makeRelease({ prerelease: true }), '1.0.0')
    expect(r).toEqual({ hasUpdate: false, info: null, latestVersion: null })
  })

  test('cmp<=0 (gleich/aelter) -> kein Update, latestVersion gesetzt', () => {
    const gleich = buildUpdateInfo(makeRelease({ tag_name: 'v1.0.0' }), '1.0.0')
    expect(gleich.hasUpdate).toBe(false)
    expect(gleich.latestVersion).toBe('1.0.0')
    const aelter = buildUpdateInfo(makeRelease({ tag_name: 'v0.9.0' }), 'v1.0.0')
    expect(aelter.hasUpdate).toBe(false)
    expect(aelter.latestVersion).toBe('0.9.0')
  })

  test('fehlender exe-Asset -> kein Update trotz neuerer Version', () => {
    const r = buildUpdateInfo(
      makeRelease({ tag_name: 'v2.0.0', assets: [makeAsset({ name: 'nur.zip' })] }), '1.0.0')
    expect(r.hasUpdate).toBe(false)
    expect(r.info).toBe(null)
    expect(r.latestVersion).toBe('2.0.0')
  })

  test('Happy-Path: v-Strip + basename-Normalisierung + sha-Durchreiche', () => {
    const rel = makeRelease({
      tag_name: 'v2.1.0',
      assets: [makeAsset({ name: 'sub/dir/RaWa-Setup.exe', size: 777, sha256: 'AB12' })]
    })
    const r = buildUpdateInfo(rel, 'v1.0.0')
    expect(r.hasUpdate).toBe(true)
    expect(r.latestVersion).toBe('2.1.0')
    expect(r.info?.version).toBe('2.1.0')
    expect(r.info?.assetName).toBe('RaWa-Setup.exe') // basename-normalisiert
    expect(r.info?.fileSize).toBe(777)
    expect(r.info?.sha256).toBe('AB12')
    expect(r.info?.isPrerelease).toBe(false)
  })
})

// --- stageInstaller End-to-End -------------------------------------------------------

test.describe('stageInstaller', () => {
  const CONTENT = 'MZ' + 'p'.repeat(4096)

  test('Happy-Path: ok, sha256Verified, onProgress monoton bis total', async () => {
    const sb = makeSandbox()
    const { size, sha } = seedInstaller(sb, 'RaWa-Setup.exe', CONTENT)
    const destPath = stagedDest(sb)
    const progress: Array<{ copied: number; total: number }> = []
    const r = await stageInstaller({
      updateDir: sb.configDir,
      info: makeInfo({ fileSize: size, sha256: sha.toUpperCase() }), // case-insensitive Gate
      destPath,
      onProgress: (copied, total) => progress.push({ copied, total })
    })
    expect(r).toEqual({ ok: true, sha256Verified: true, error: null })
    expect(existsSync(destPath)).toBe(true)
    expect(statSync(destPath).size).toBe(size)
    expect(progress.length).toBeGreaterThan(0)
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].copied).toBeGreaterThanOrEqual(progress[i - 1].copied)
    }
    expect(progress[progress.length - 1].copied).toBe(size)
    expect(progress.every((p) => p.total === size)).toBe(true)
  })

  test('ohne Manifest-sha256: ok, aber sha256Verified false', async () => {
    const sb = makeSandbox()
    const { size } = seedInstaller(sb, 'RaWa-Setup.exe', CONTENT)
    const r = await stageInstaller({
      updateDir: sb.configDir, info: makeInfo({ fileSize: size }), destPath: stagedDest(sb)
    })
    expect(r).toEqual({ ok: true, sha256Verified: false, error: null })
  })

  test('MZ-Fail: error invalid-installer UND Teil-Copy unter _failed/', async () => {
    const sb = makeSandbox()
    const zipContent = 'PK' + 'p'.repeat(4096)
    const { size } = seedInstaller(sb, 'RaWa-Setup.exe', zipContent)
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir, info: makeInfo({ fileSize: size }), destPath
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid-installer')
    expect(existsSync(destPath)).toBe(false) // HR7: kein silent unlink, sondern Move
    const failed = readdirSync(join(sb.root, 'staged', '_failed'))
    expect(failed.length).toBe(1)
    expect(failed[0].endsWith('_app-setup.exe')).toBe(true)
  })

  test('Groessen-Fail: exakter Fehlerstring + _failed-Move', async () => {
    const sb = makeSandbox()
    const { size } = seedInstaller(sb, 'RaWa-Setup.exe', CONTENT)
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir, info: makeInfo({ fileSize: size + 5 }), destPath
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('Groesse stimmt nicht ueberein') // 1:1 aus update-source-local.ts
    expect(existsSync(destPath)).toBe(false)
    expect(readdirSync(join(sb.root, 'staged', '_failed')).length).toBe(1)
  })

  test('SHA-Mismatch: exakter Fehlerstring + _failed-Move', async () => {
    const sb = makeSandbox()
    const { size } = seedInstaller(sb, 'RaWa-Setup.exe', CONTENT)
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir,
      info: makeInfo({ fileSize: size, sha256: 'deadbeef'.repeat(8) }),
      destPath
    })
    expect(r.ok).toBe(false)
    expect(r.sha256Verified).toBe(false)
    expect(r.error).toBe('Pruefsumme stimmt nicht ueberein')
    expect(existsSync(destPath)).toBe(false)
    expect(readdirSync(join(sb.root, 'staged', '_failed')).length).toBe(1)
  })

  test('source-missing: Quelle fehlt -> Fehler ohne Copy-Versuch', async () => {
    const sb = makeSandbox()
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir, info: makeInfo({ assetName: 'nie-da.exe' }), destPath
    })
    expect(r).toEqual({ ok: false, sha256Verified: false, error: 'source-missing' })
    expect(existsSync(destPath)).toBe(false)
  })
})
