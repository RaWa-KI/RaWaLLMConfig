// update-source-local-linux.spec.ts - Linux-Specs fuer lokalen Update-Transport.
import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, seedFile, type Sandbox } from './fixtures'
import {
  buildUpdateInfo,
  selectAsset,
  stageInstaller,
  UPDATE_CONSTANTS,
} from '../../src/main/services/update-source-local'
import { assetSpecFor } from '../../src/main/services/update-platform'
import type { UpdateAsset, UpdateInfo, UpdateRelease } from '../../shared/contract-updates'

test.setTimeout(30_000 + UPDATE_CONSTANTS.COPY_FLUSH_DELAY_MS)

function makeAsset(over: Partial<UpdateAsset> = {}): UpdateAsset {
  return { name: 'RaWa-Setup.exe', browser_download_url: 'file://audit-only', size: 102, ...over }
}

function makeRelease(assets: UpdateAsset[]): UpdateRelease {
  return {
    tag_name: 'v2.0.0',
    name: 'Release 2.0.0',
    body: 'Notes',
    published_at: '2026-06-10T00:00:00Z',
    prerelease: false,
    assets,
  }
}

function makeInfo(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: '2.0.0',
    name: 'Release 2.0.0',
    releaseNotes: '',
    publishedAt: '2026-06-10T00:00:00Z',
    assetName: 'RaWaLLMConfig.AppImage',
    fileSize: 102,
    isPrerelease: false,
    ...over,
  }
}

function seedInstaller(sb: Sandbox, name: string, content: string): { size: number; sha: string } {
  seedFile(sb, name, content)
  return {
    size: Buffer.byteLength(content),
    sha: createHash('sha256').update(Buffer.from(content, 'utf8')).digest('hex'),
  }
}

function stagedDest(sb: Sandbox): string {
  const dir = join(sb.root, 'staged')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'app-setup.AppImage')
}

test.describe('selectAsset linux', () => {
  test('waehlt .AppImage und ignoriert .exe', () => {
    const linuxSpec = assetSpecFor('linux')
    const appImage = makeAsset({ name: 'RaWaLLMConfig.AppImage' })
    expect(selectAsset([makeAsset({ name: 'RaWa-Setup.exe' }), appImage], linuxSpec)).toBe(appImage)
    expect(selectAsset([makeAsset({ name: 'RaWa-Setup.exe' })], linuxSpec)).toBe(null)
  })

  test('buildUpdateInfo meldet noPlatformAsset fuer exe-only Release', () => {
    const result = buildUpdateInfo(makeRelease([makeAsset({ name: 'RaWa-Setup.exe' })]), '1.0.0', assetSpecFor('linux'))
    expect(result).toEqual({ hasUpdate: false, info: null, latestVersion: '2.0.0', noPlatformAsset: true })
  })
})

test.describe('stageInstaller linux', () => {
  test('ELF-AppImage wird staged', async () => {
    const sb = makeSandbox()
    const content = '\u007fELF' + 'p'.repeat(4096)
    const { size, sha } = seedInstaller(sb, 'RaWaLLMConfig.AppImage', content)
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir,
      info: makeInfo({ fileSize: size, sha256: sha }),
      destPath,
      platformSpec: assetSpecFor('linux'),
    })
    expect(r).toEqual({ ok: true, sha256Verified: true, error: null })
    expect(existsSync(destPath)).toBe(true)
    expect(statSync(destPath).size).toBe(size)
  })

  test('MZ-AppImage wird als invalid-installer nach _failed verschoben', async () => {
    const sb = makeSandbox()
    const content = 'MZ' + 'p'.repeat(4096)
    const { size } = seedInstaller(sb, 'RaWaLLMConfig.AppImage', content)
    const destPath = stagedDest(sb)
    const r = await stageInstaller({
      updateDir: sb.configDir,
      info: makeInfo({ fileSize: size }),
      destPath,
      platformSpec: assetSpecFor('linux'),
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('invalid-installer')
    expect(existsSync(destPath)).toBe(false)
    expect(readdirSync(join(sb.root, 'staged', '_failed')).length).toBe(1)
  })
})
