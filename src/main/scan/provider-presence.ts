// Zentrales Presence-Gate fuer optionale Provider. Ein eingebautes Manifest
// ist nur ein Katalogeintrag, kein Beleg dafuer, dass der Provider genutzt wird.
import { existsSync } from 'node:fs'
import type { ProviderManifest } from '@shared/contract-provider'
import { resolveRoots, userSourceRootsForProvider } from '../services/config-roots'
import { isCloudProviderEnabled } from '../services/cloud-provider-state'
import { isProviderScanEnabled } from './integration-filter'

const CLOUD_IDS = ['openai', 'anthropic', 'gemini'] as const
const CLOUD_ENV_NAMES = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
] as const

function pathExists(root: string): boolean {
  try {
    return existsSync(root)
  } catch {
    return false
  }
}

function cloudIsPresent(): boolean {
  if (CLOUD_IDS.some((id) => isCloudProviderEnabled(id))) return true
  return CLOUD_ENV_NAMES.some((name) => typeof process.env[name] === 'string' && process.env[name]!.trim() !== '')
}

/**
 * Provider scannen, wenn seine Integration aktiv ist UND eine reale Root- oder
 * Konfigurations-Evidenz vorliegt. Nutzer-Manifeste selbst sind eine explizite
 * Konfiguration und werden vom Aufrufer mit `explicit: true` freigegeben.
 */
export function isProviderPresent(manifest: ProviderManifest, explicit = false): boolean {
  if (!isProviderScanEnabled(manifest.id)) return false
  if (explicit) return true
  if (manifest.id === 'cloud') return cloudIsPresent()
  if (userSourceRootsForProvider(manifest.id).length > 0) return true
  return resolveRoots(manifest.roots, manifest.id).some(pathExists)
}
