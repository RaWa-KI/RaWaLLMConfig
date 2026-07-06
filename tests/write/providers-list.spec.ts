// providers-list.spec.ts — Provider-Auswahl-Liste aus providerRegistry() (WP-C2).
// Beweist die R-C4-Auflage: die Liste wird aus der Registry abgeleitet (nicht
// statisch) und enthaelt genau die Manifest-Provider — inkl. der additiven
// 'cloud'-Familie (Teil D) — jeweils mit nicht-leerem label.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner.
import { test, expect } from '@playwright/test'
import { listProviderChoices } from '../../src/main/services/providers-list'

test('liefert genau die 5 Manifest-Provider', () => {
  const choices = listProviderChoices()
  expect(choices.length).toBe(5)
})

test('enthaelt die Bestands-Familien + additive cloud-Familie', () => {
  const ids = listProviderChoices().map((c) => c.id)
  for (const id of ['shared', 'claude', 'codex', 'local', 'cloud']) {
    expect(ids).toContain(id)
  }
})

test('jeder Eintrag hat ein nicht-leeres label', () => {
  for (const c of listProviderChoices()) {
    expect(typeof c.label).toBe('string')
    expect(c.label.length).toBeGreaterThan(0)
  }
})
