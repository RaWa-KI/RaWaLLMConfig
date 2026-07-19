// update-platform.spec.ts - Pure Specs fuer Plattform-Asset-Auswahl.
import { test, expect } from '@playwright/test'
import type { UpdateAsset } from '../../shared/contract-updates'
import {
  assetSpecFor,
  currentUpdatePlatform,
  matchesPlatformAsset,
} from '../../src/main/services/update-platform'

function makeAsset(over: Partial<UpdateAsset> = {}): UpdateAsset {
  return { name: 'artifact.zip', browser_download_url: 'file://audit-only', size: 1, ...over }
}

test.describe('currentUpdatePlatform', () => {
  test('linux bleibt linux', () => {
    expect(currentUpdatePlatform('linux')).toBe('linux')
  })

  test('alles andere faellt auf win32 zurueck', () => {
    expect(currentUpdatePlatform('win32')).toBe('win32')
    expect(currentUpdatePlatform('darwin')).toBe('win32')
  })
})

test.describe('assetSpecFor', () => {
  test('Windows-Spec ist .exe/x-msdownload/MZ/not-exe', () => {
    expect(assetSpecFor('win32')).toEqual({
      platform: 'win32',
      extension: '.exe',
      contentTypes: ['application/x-msdownload'],
      magic: [0x4d, 0x5a],
      wrongFormatError: 'not-exe',
    })
  })

  test('Linux-Spec ist .appimage/appimage+octet/ELF/not-appimage', () => {
    expect(assetSpecFor('linux')).toEqual({
      platform: 'linux',
      extension: '.appimage',
      contentTypes: ['application/x-appimage', 'application/octet-stream'],
      magic: [0x7f, 0x45, 0x4c, 0x46],
      wrongFormatError: 'not-appimage',
    })
  })
})

test.describe('matchesPlatformAsset', () => {
  test('Windows matcht content_type oder .exe case-insensitive', () => {
    const spec = assetSpecFor('win32')
    expect(matchesPlatformAsset(makeAsset({ content_type: 'application/x-msdownload' }), spec)).toBe(true)
    expect(matchesPlatformAsset(makeAsset({ name: 'Setup.EXE' }), spec)).toBe(true)
    expect(matchesPlatformAsset(makeAsset({ name: 'Setup.AppImage' }), spec)).toBe(false)
  })

  test('Linux matcht content_type oder .appimage case-insensitive', () => {
    const spec = assetSpecFor('linux')
    expect(matchesPlatformAsset(makeAsset({ content_type: 'application/x-appimage' }), spec)).toBe(true)
    expect(matchesPlatformAsset(makeAsset({ content_type: 'application/octet-stream' }), spec)).toBe(true)
    expect(matchesPlatformAsset(makeAsset({ name: 'RaWa.AppImage' }), spec)).toBe(true)
    expect(matchesPlatformAsset(makeAsset({ name: 'RaWa.exe' }), spec)).toBe(false)
  })
})
