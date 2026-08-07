// cloud-provider-state.spec.ts — WP1 (Diagnosekarten-Regel 2026-07-28):
// Key-Karten nur bei aktivierter Nutzungsabsicht. Deckt den Pref-Key-Parser,
// den synchronen Scan-Cache und die Verdrahtung in cloud-scan (providerEnabled
// + neutraler „nicht eingerichtet"-Text bei nicht genutztem Anbieter) ab.
import { test, expect } from '@playwright/test'
import {
  isCloudProviderEnabled,
  providerIdFromPrefKey,
  refreshCloudProviderPrefs,
  setCloudProviderEnabledFromPref
} from '../../src/main/services/cloud-provider-state'
import { cloudCategories } from '../../src/main/scan/providers/cloud-scan'

test('WP1: Pref-Key-Parser akzeptiert nur cloudProvider.<id>.enabled', () => {
  expect(providerIdFromPrefKey('cloudProvider.openai.enabled')).toBe('openai')
  expect(providerIdFromPrefKey('cloudProvider.gemini.enabled')).toBe('gemini')
  expect(providerIdFromPrefKey('cloudProvider..enabled')).toBeNull()
  expect(providerIdFromPrefKey('cloudProvider.openai.other')).toBeNull()
  expect(providerIdFromPrefKey('roots.sharedClaude')).toBeNull()
  expect(providerIdFromPrefKey('theme')).toBeNull()
})

test('WP1: Default ist aus — ohne Toggle ist kein Anbieter aktiviert', () => {
  refreshCloudProviderPrefs({ theme: 'hell' })
  expect(isCloudProviderEnabled('openai')).toBe(false)
  expect(isCloudProviderEnabled('anthropic')).toBe(false)
  expect(isCloudProviderEnabled('gemini')).toBe(false)
})

test('WP1: Toggle aus Prefs-Snapshot und Einzel-Update steuern die Nutzungsabsicht', () => {
  refreshCloudProviderPrefs({ 'cloudProvider.openai.enabled': true, 'cloudProvider.gemini.enabled': false })
  expect(isCloudProviderEnabled('openai')).toBe(true)
  expect(isCloudProviderEnabled('gemini')).toBe(false)

  expect(setCloudProviderEnabledFromPref('cloudProvider.gemini.enabled', true)).toBe(true)
  expect(isCloudProviderEnabled('gemini')).toBe(true)
  expect(setCloudProviderEnabledFromPref('theme', 'dunkel')).toBe(false)
  // Fremde Keys veraendern den Cache nicht.
  expect(isCloudProviderEnabled('openai')).toBe(true)
})

test('WP1: cloud-scan traegt Nutzungsabsicht + neutralen Text bei nicht genutztem Anbieter', () => {
  refreshCloudProviderPrefs({})
  const openaiOff = cloudCategories()[0].entries[0]
  expect(openaiOff.providerEnabled).toBe(false)
  if (openaiOff.status !== 'active') {
    expect(openaiOff.desc).toContain('Nicht eingerichtet')
    expect(openaiOff.desc).not.toContain('hinterlegen')
  }

  refreshCloudProviderPrefs({ 'cloudProvider.openai.enabled': true })
  const openaiOn = cloudCategories()[0].entries[0]
  expect(openaiOn.providerEnabled).toBe(true)
  if (openaiOn.status !== 'active') {
    expect(openaiOn.desc).toContain('hinterlegen')
  }
  // Aufraeumen: Cache auf Default zuruecksetzen, damit Folge-Specs unbeeinflusst bleiben.
  refreshCloudProviderPrefs({})
})
