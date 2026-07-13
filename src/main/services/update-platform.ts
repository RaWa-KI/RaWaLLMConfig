/**
 * update-platform.ts - Pure Plattform-Spezifikation fuer Update-Assets.
 * SRP: Auswahl- und Header-Regeln, keine Datei-, Netz- oder Prozesszugriffe.
 */

import type { UpdateAsset } from '@shared/contract-updates'

export type UpdatePlatform = 'win32' | 'linux'

export interface PlatformAssetSpec {
  platform: UpdatePlatform
  extension: string
  contentTypes: readonly string[]
  magic: readonly number[]
  wrongFormatError: string
}

const SPECS: Record<UpdatePlatform, PlatformAssetSpec> = {
  win32: {
    platform: 'win32',
    extension: '.exe',
    contentTypes: ['application/x-msdownload'],
    magic: [0x4d, 0x5a],
    wrongFormatError: 'not-exe',
  },
  linux: {
    platform: 'linux',
    extension: '.appimage',
    contentTypes: ['application/x-appimage', 'application/octet-stream'],
    magic: [0x7f, 0x45, 0x4c, 0x46],
    wrongFormatError: 'not-appimage',
  },
}

export function currentUpdatePlatform(platform: NodeJS.Platform = process.platform): UpdatePlatform {
  return platform === 'linux' ? 'linux' : 'win32'
}

export function assetSpecFor(platform: UpdatePlatform): PlatformAssetSpec {
  return SPECS[platform]
}

export function matchesPlatformAsset(asset: UpdateAsset, spec: PlatformAssetSpec): boolean {
  const name = typeof asset.name === 'string' ? asset.name.toLowerCase() : ''
  return spec.contentTypes.includes(asset.content_type ?? '') || name.endsWith(spec.extension)
}
