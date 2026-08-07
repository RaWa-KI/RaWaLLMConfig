// cloud-auth-mode.spec.ts — WP-F7: Auth-Modus je Cloud-Provider
// (Pref `cloudProvider.<id>.authMode`, 'apiKey' | 'oauth' | unset).
// Kernbeweise:
//  (1) Parser akzeptiert nur `cloudProvider.<id>.authMode` und nur die Werte
//      'apiKey'/'oauth' — alles andere ist unset (Default = Key-Pruefung).
//  (2) Modus 'oauth' -> KEINE Key-Karte: der erste Eintrag ist der neutrale
//      OAuth-Hinweis (status 'info', desc „OAuth-Login im Tool", KEIN Feld
//      'Env-Variable' — das Vertragssignal der Key-Karte fehlt bewusst,
//      isMissingKeyEntry im Renderer greift damit nicht).
//  (3) Modus 'apiKey' und unset -> bisherige Env-Key-Pruefung unveraendert.
//  (4) prefs:set-Pfad: setCloudProviderEnabledFromPref zieht auch den
//      Auth-Modus in den Cache nach (true = Scan-Invalidierung noetig).
import { test, expect } from '@playwright/test'
import {
  getCloudProviderAuthMode,
  parseCloudAuthMode,
  providerIdFromAuthModePrefKey,
  refreshCloudProviderPrefs,
  setCloudProviderEnabledFromPref
} from '../../src/main/services/cloud-provider-state'
import { cloudCategories } from '../../src/main/scan/providers/cloud-scan'

// Nach jedem Test Cache + Env aufraeumen, damit kein Test den naechsten faerbt.
test.afterEach(() => {
  refreshCloudProviderPrefs({})
  delete process.env.OPENAI_API_KEY
})

test('F7: Pref-Key-Parser akzeptiert nur cloudProvider.<id>.authMode', () => {
  expect(providerIdFromAuthModePrefKey('cloudProvider.openai.authMode')).toBe('openai')
  expect(providerIdFromAuthModePrefKey('cloudProvider.gemini.authMode')).toBe('gemini')
  expect(providerIdFromAuthModePrefKey('cloudProvider..authMode')).toBeNull()
  expect(providerIdFromAuthModePrefKey('cloudProvider.openai.enabled')).toBeNull()
  expect(providerIdFromAuthModePrefKey('theme')).toBeNull()
})

test('F7: nur apiKey/oauth sind gueltige Modi — alles andere ist unset', () => {
  expect(parseCloudAuthMode('apiKey')).toBe('apiKey')
  expect(parseCloudAuthMode('oauth')).toBe('oauth')
  expect(parseCloudAuthMode('')).toBeNull()
  expect(parseCloudAuthMode('OAUTH')).toBeNull()
  expect(parseCloudAuthMode(true)).toBeNull()
})

test('F7: Snapshot + Einzel-Update fuellen den Auth-Modus-Cache, Default unset', () => {
  refreshCloudProviderPrefs({})
  expect(getCloudProviderAuthMode('openai')).toBeNull()

  refreshCloudProviderPrefs({ 'cloudProvider.openai.authMode': 'oauth' })
  expect(getCloudProviderAuthMode('openai')).toBe('oauth')
  expect(getCloudProviderAuthMode('anthropic')).toBeNull()

  // prefs:set-Pfad: true = Cache aktualisiert -> Aufrufer invalidiert den Scan.
  expect(setCloudProviderEnabledFromPref('cloudProvider.openai.authMode', 'apiKey')).toBe(true)
  expect(getCloudProviderAuthMode('openai')).toBe('apiKey')
  // Ungueltiger Wert setzt zurueck auf unset (Default-Verhalten).
  expect(setCloudProviderEnabledFromPref('cloudProvider.openai.authMode', '')).toBe(true)
  expect(getCloudProviderAuthMode('openai')).toBeNull()
  // Fremde Keys bleiben unbeteiligt.
  expect(setCloudProviderEnabledFromPref('theme', 'dunkel')).toBe(false)
})

test('F7: Modus oauth -> keine Key-Karte, neutraler Hinweis „OAuth-Login im Tool"', () => {
  refreshCloudProviderPrefs({
    'cloudProvider.openai.enabled': true,
    'cloudProvider.openai.authMode': 'oauth'
  })
  const first = cloudCategories()[0].entries[0]
  expect(first.id).toBe('cloud-openai-auth')
  expect(first.status).toBe('info')
  expect(first.desc).toContain('OAuth-Login im Tool')
  // Vertragssignal der Key-Karte fehlt -> isMissingKeyEntry greift nicht,
  // es entsteht KEINE „Key nicht gesetzt"-Diagnosekarte.
  expect(first.fields?.['Env-Variable']).toBeUndefined()
  expect(first.fields?.['Auth-Modus']).toBe('OAuth-Login im Tool')
  expect(first.providerEnabled).toBe(true)
})

test('F7: Modus apiKey und unset -> bisherige Key-Karte mit Env-Pruefung', () => {
  delete process.env.OPENAI_API_KEY
  // unset (Default): Key-Karte wie bisher.
  refreshCloudProviderPrefs({ 'cloudProvider.openai.enabled': true })
  const unset = cloudCategories()[0].entries[0]
  expect(unset.id).toBe('cloud-openai-key')
  expect(unset.status).toBe('notConfigured')
  expect(unset.fields?.['Env-Variable']).toContain('OPENAI_API_KEY')

  // explizit 'apiKey': identisches Verhalten.
  refreshCloudProviderPrefs({
    'cloudProvider.openai.enabled': true,
    'cloudProvider.openai.authMode': 'apiKey'
  })
  const apiKey = cloudCategories()[0].entries[0]
  expect(apiKey.id).toBe('cloud-openai-key')
  expect(apiKey.fields?.['Status']).toBe('nicht gesetzt')
})

test('F7 LEAK-NEGATIVTEST: auch im oauth-Modus kein Key-Wert im Ergebnis', () => {
  process.env.OPENAI_API_KEY = 'dummy'
  refreshCloudProviderPrefs({ 'cloudProvider.openai.authMode': 'oauth' })
  const serialized = JSON.stringify(cloudCategories())
  expect(serialized.includes('dummy')).toBe(false)
})
