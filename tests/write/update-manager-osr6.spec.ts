import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, seedFile, type Sandbox } from './fixtures'
import { checkForUpdates, getUpdateState } from '../../src/main/services/update-manager'
import { setUpdateMgrDepsForTest, type UpdateMgrDeps } from '../../src/main/services/update-manager-deps'
import { assetSpecFor, currentUpdatePlatform } from '../../src/main/services/update-platform'
import { deMessages, enMessages, MESSAGE_PARAM_NAMES } from '../../shared/messages'

test.describe.configure({ mode: 'serial' })

const ENV_DIR = 'RAWALLM_UPDATE_DIR'
const ENV_GATE = 'RAWALLM_UPDATE_ENABLED'
const ENV_RELEASE = 'RAWALLM_RELEASE_URL'
const CURRENT_VERSION = '0.1.2'
const UPDATE_PLATFORM = currentUpdatePlatform()
const PLATFORM_SPEC = assetSpecFor(UPDATE_PLATFORM)
const OPPOSITE_PLATFORM = UPDATE_PLATFORM === 'linux' ? 'win32' : 'linux'
const OPPOSITE_SPEC = assetSpecFor(OPPOSITE_PLATFORM)
const ASSET_NAME = PLATFORM_SPEC.platform === 'linux' ? 'RaWaLLMConfig.AppImage' : 'RaWa-Setup.exe'
const OPPOSITE_ASSET_NAME = OPPOSITE_SPEC.platform === 'linux' ? 'RaWaLLMConfig.AppImage' : 'RaWa-Setup.exe'
const INSTALLER_CONTENT = PLATFORM_SPEC.platform === 'linux'
  ? '\u007fELF' + 'x'.repeat(1024)
  : 'MZ' + 'x'.repeat(1024)
const OPPOSITE_CONTENT = OPPOSITE_SPEC.platform === 'linux'
  ? '\u007fELF' + 'x'.repeat(1024)
  : 'MZ' + 'x'.repeat(1024)
const OPPOSITE_NOTES = `${OPPOSITE_PLATFORM} notes`

let dirBefore: string | undefined
let gateBefore: string | undefined
let releaseBefore: string | undefined

test.beforeEach(() => {
  dirBefore = process.env[ENV_DIR]
  gateBefore = process.env[ENV_GATE]
  releaseBefore = process.env[ENV_RELEASE]
  delete process.env[ENV_DIR]
  delete process.env[ENV_GATE]
  process.env[ENV_RELEASE] = 'disabled-for-tests'
})

test.afterEach(() => {
  restoreEnv(ENV_DIR, dirBefore)
  restoreEnv(ENV_GATE, gateBefore)
  restoreEnv(ENV_RELEASE, releaseBefore)
  setUpdateMgrDepsForTest({})
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

function installDeps(sb: Sandbox, over: Partial<UpdateMgrDeps> = {}): void {
  setUpdateMgrDepsForTest({
    getVersion: () => CURRENT_VERSION,
    getTempPath: () => {
      const dir = join(sb.root, 'temp')
      mkdirSync(dir, { recursive: true })
      return dir
    },
    exportPrefsSnapshot: () => ({ data: { source: 'prefs', snapshotPath: '' }, error: null }),
    resolvePrefsSet: async () => {},
    ...over,
  })
}

function seedRelease(sb: Sandbox, version = CURRENT_VERSION): void {
  const size = Buffer.byteLength(INSTALLER_CONTENT)
  const sha = createHash('sha256').update(INSTALLER_CONTENT, 'utf8').digest('hex')
  seedFile(sb, ASSET_NAME, INSTALLER_CONTENT)
  seedFile(sb, 'latest.json', JSON.stringify({
    tag_name: `v${version}`,
    name: `Release ${version}`,
    body: 'Notes',
    published_at: '2026-07-08T00:00:00Z',
    prerelease: false,
    assets: [{
      name: ASSET_NAME,
      browser_download_url: 'file://audit-only',
      size,
      sha256: sha,
    }],
  }))
  process.env[ENV_DIR] = sb.configDir
}

function seedOppositePlatformRelease(sb: Sandbox): void {
  seedFile(sb, OPPOSITE_ASSET_NAME, OPPOSITE_CONTENT)
  seedFile(sb, 'latest.json', JSON.stringify({
    tag_name: 'v9.9.9',
    name: 'Release 9.9.9',
    body: OPPOSITE_NOTES,
    published_at: '2026-07-10T00:00:00Z',
    prerelease: false,
    assets: [{
      name: OPPOSITE_ASSET_NAME,
      browser_download_url: 'file://audit-only',
      size: Buffer.byteLength(OPPOSITE_CONTENT),
    }],
  }))
  process.env[ENV_DIR] = sb.configDir
}

test('default source label names GitHub without showing the raw URL', () => {
  const sb = makeSandbox()
  installDeps(sb)
  delete process.env[ENV_RELEASE]
  const st = getUpdateState()
  expect(st.sourceConfigured).toBe(true)
  expect(st.sourceKind).toBe('https')
  expect(st.sourceLabel).toBe('Öffentliche Releases (GitHub)')
  expect(st.sourceLabel).not.toContain('https://')
})

test('fresh current check records success and clears source error', async () => {
  const sb = makeSandbox()
  installDeps(sb)
  seedRelease(sb)
  const result = await checkForUpdates()
  expect(result.error).toBe(null)
  expect(result.data?.hasUpdate).toBe(false)
  expect(result.data?.latestVersion).toBe(CURRENT_VERSION)
  expect(result.data?.lastSourceError).toBe(null)
  const st = getUpdateState()
  expect(st.phase).toBe('idle')
  expect(st.latestVersion).toBe(CURRENT_VERSION)
  expect(st.lastSourceError).toBe(null)
  expect(st.lastCheckedAt).toBeTruthy()
  expect(st.history.some((h) => h.event === 'up-to-date')).toBe(true)
})

test('source error keeps stale known status without claiming a fresh no-update result', async () => {
  const sb = makeSandbox()
  installDeps(sb)
  seedRelease(sb)
  await checkForUpdates()
  const successfulAt = getUpdateState().lastCheckedAt
  seedFile(sb, 'latest.json', '{ kaputt')
  const errored = await checkForUpdates()
  expect(errored.error).toBe(null)
  expect(errored.data?.hasUpdate).toBe(false)
  expect(errored.data?.latestVersion).toBe(CURRENT_VERSION)
  expect(errored.data?.lastSourceError).toBe('Quelle gerade nicht erreichbar')
  const st = getUpdateState()
  expect(st.phase).toBe('idle')
  expect(st.latestVersion).toBe(CURRENT_VERSION)
  expect(st.lastCheckedAt).toBe(successfulAt)
  expect(st.lastSourceError).toBe('Quelle gerade nicht erreichbar')
})

test('newer release without current platform asset stays idle and honest', async () => {
  const sb = makeSandbox()
  installDeps(sb)
  seedOppositePlatformRelease(sb)
  const result = await checkForUpdates()
  expect(result.error).toBe(null)
  expect(result.data?.hasUpdate).toBe(false)
  expect(result.data?.info).toBe(null)
  expect(result.data?.latestVersion).toBe('9.9.9')
  expect(result.data?.noPlatformAsset).toBe(true)
  const st = getUpdateState()
  expect(st.phase).toBe('idle')
  expect(st.assetName).toBe(null)
  expect(st.releaseNotes).toBe(OPPOSITE_NOTES)
  expect(st.noPlatformAsset).toBe(true)
  expect(st.history.some((h) => h.event === 'no-platform-asset')).toBe(true)
})

test('OSR-6 update messages stay mirrored and typed', () => {
  expect(deMessages['update.sourceError.title']).toBe('Quelle gerade nicht erreichbar.')
  expect(enMessages['update.sourceError.title']).toBe('Source currently unreachable.')
  expect(deMessages['update.noPlatformAsset.detail']).toContain('kein Update-Paket')
  expect(enMessages['update.noPlatformAsset.detail']).toContain('update package')
  expect(MESSAGE_PARAM_NAMES['update.sourceError.detail']).toEqual(['sourceLabel'])
  expect(MESSAGE_PARAM_NAMES['update.noPlatformAsset.detail']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['update.sourceStatus.localKnown']).toEqual(['version'])
  expect(MESSAGE_PARAM_NAMES['update.sourceStatus.lastSuccess']).toEqual(['checkedAt'])
})
