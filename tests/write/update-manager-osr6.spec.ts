import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, seedFile, type Sandbox } from './fixtures'
import { checkForUpdates, getUpdateState } from '../../src/main/services/update-manager'
import { setUpdateMgrDepsForTest, type UpdateMgrDeps } from '../../src/main/services/update-manager-deps'
import { deMessages, enMessages, MESSAGE_PARAM_NAMES } from '../../shared/messages'

test.describe.configure({ mode: 'serial' })

const ENV_DIR = 'RAWALLM_UPDATE_DIR'
const ENV_GATE = 'RAWALLM_UPDATE_ENABLED'
const ENV_RELEASE = 'RAWALLM_RELEASE_URL'
const CURRENT_VERSION = '0.1.2'
const INSTALLER_CONTENT = 'MZ' + 'x'.repeat(1024)

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
  seedFile(sb, 'RaWa-Setup.exe', INSTALLER_CONTENT)
  seedFile(sb, 'latest.json', JSON.stringify({
    tag_name: `v${version}`,
    name: `Release ${version}`,
    body: 'Notes',
    published_at: '2026-07-08T00:00:00Z',
    prerelease: false,
    assets: [{
      name: 'RaWa-Setup.exe',
      browser_download_url: 'file://audit-only',
      size,
      sha256: sha,
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

test('OSR-6 update messages stay mirrored and typed', () => {
  expect(deMessages['update.sourceError.title']).toBe('Quelle gerade nicht erreichbar.')
  expect(enMessages['update.sourceError.title']).toBe('Source currently unreachable.')
  expect(MESSAGE_PARAM_NAMES['update.sourceError.detail']).toEqual(['sourceLabel'])
  expect(MESSAGE_PARAM_NAMES['update.sourceStatus.localKnown']).toEqual(['version'])
  expect(MESSAGE_PARAM_NAMES['update.sourceStatus.lastSuccess']).toEqual(['checkedAt'])
})
