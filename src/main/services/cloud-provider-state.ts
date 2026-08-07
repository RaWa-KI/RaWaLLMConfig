// cloud-provider-state.ts — Nutzungsabsicht je Cloud-Anbieter (Diagnosekarten-
// Regel WP1, 2026-07-28). Die Prefs (`cloudProvider.<id>.enabled`, Default AUS)
// werden einmal beim Start und bei jedem prefs:set aus ipc-write-prefs in einen
// synchronen Modul-Cache gespiegelt (Muster: setRootPrefsProvider), damit der
// synchrone cloud-scan ohne async Prefs-Zugriff arbeiten kann.
//
// Produktregel: Eine „Key nicht gesetzt"-Diagnosekarte darf nur erscheinen,
// wenn der Nutzer den Anbieter aktiviert hat (er kann UND will ihn beheben).
// Ein OAuth-/Login-Setup ohne API-Keys zeigt so null Key-Karten.
import type { PrefValue } from '@shared/contract-write'
import type { CloudAuthMode } from '@shared/contract-provider'

export const CLOUD_PROVIDER_PREF_PREFIX = 'cloudProvider.'
export const CLOUD_PROVIDER_PREF_SUFFIX = '.enabled'
// WP-F7: Auth-Modus-Pref je Anbieter (`cloudProvider.<id>.authMode`).
export const CLOUD_PROVIDER_AUTHMODE_SUFFIX = '.authMode'

// Modul-Cache: nur explizit aktivierte Anbieter (true). Ungesetzt = aus.
let enabledProviders: Record<string, boolean> = {}
// WP-F7-Cache: gewaehlter Auth-Modus je Anbieter. Ungesetzt = bisheriges
// Verhalten (Key-Pruefung); nur 'apiKey'/'oauth' sind gueltige Werte.
let authModes: Record<string, CloudAuthMode> = {}

/** Prefs-Snapshot in die Caches spiegeln (App-Start + nach jedem prefs:set). */
export function refreshCloudProviderPrefs(all: Record<string, PrefValue>): void {
  const nextEnabled: Record<string, boolean> = {}
  const nextModes: Record<string, CloudAuthMode> = {}
  for (const [key, value] of Object.entries(all)) {
    const enabledId = providerIdFromPrefKey(key)
    if (enabledId) nextEnabled[enabledId] = value === true
    const modeId = providerIdFromAuthModePrefKey(key)
    const mode = modeId ? parseCloudAuthMode(value) : null
    if (modeId && mode) nextModes[modeId] = mode
  }
  enabledProviders = nextEnabled
  authModes = nextModes
}

/**
 * Einzelnen Cloud-Pref nach erfolgreichem prefs:set nachziehen (ohne Voll-Read).
 * Deckt Enable-Toggle UND Auth-Modus (WP-F7) ab; true = Cache aktualisiert,
 * der Aufrufer invalidiert dann den Config-Scan.
 */
export function setCloudProviderEnabledFromPref(key: string, value: PrefValue): boolean {
  const enabledId = providerIdFromPrefKey(key)
  if (enabledId) {
    enabledProviders = { ...enabledProviders, [enabledId]: value === true }
    return true
  }
  const modeId = providerIdFromAuthModePrefKey(key)
  if (!modeId) return false
  const mode = parseCloudAuthMode(value)
  const next = { ...authModes }
  if (mode) next[modeId] = mode
  else delete next[modeId] // ungueltig/leer = zurueck auf unset (Default)
  authModes = next
  return true
}

/** Nutzungsabsicht: true NUR bei explizit aktiviertem Toggle. Default aus. */
export function isCloudProviderEnabled(providerId: string): boolean {
  return enabledProviders[providerId] === true
}

/**
 * Gewaehlter Auth-Modus (WP-F7): 'apiKey' | 'oauth' | null (unset).
 * null = Default = bisheriges Verhalten (Key-Pruefung wie 'apiKey').
 */
export function getCloudProviderAuthMode(providerId: string): CloudAuthMode | null {
  return authModes[providerId] ?? null
}

/** Pref-Key `cloudProvider.<id>.enabled` -> `<id>`, sonst null. */
export function providerIdFromPrefKey(key: string): string | null {
  return providerIdBetween(key, CLOUD_PROVIDER_PREF_SUFFIX)
}

/** Pref-Key `cloudProvider.<id>.authMode` -> `<id>`, sonst null (WP-F7). */
export function providerIdFromAuthModePrefKey(key: string): string | null {
  return providerIdBetween(key, CLOUD_PROVIDER_AUTHMODE_SUFFIX)
}

// Gemeinsamer Parser: `cloudProvider.<id><suffix>` -> `<id>`, sonst null.
function providerIdBetween(key: string, suffix: string): string | null {
  if (!key.startsWith(CLOUD_PROVIDER_PREF_PREFIX) || !key.endsWith(suffix)) return null
  const id = key.slice(CLOUD_PROVIDER_PREF_PREFIX.length, -suffix.length)
  return id.length > 0 ? id : null
}

/** Nur 'apiKey'/'oauth' sind gueltig; alles andere (auch '') = unset. */
export function parseCloudAuthMode(value: PrefValue): CloudAuthMode | null {
  return value === 'apiKey' || value === 'oauth' ? value : null
}
