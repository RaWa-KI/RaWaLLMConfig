// providers-list.spec.ts — Provider-Auswahl-Liste aus providerRegistry() (WP-C2).
// Beweist die R-C4-Auflage: die Liste wird aus der Registry abgeleitet (nicht
// statisch) und enthaelt genau die Manifest-Provider — inkl. der additiven
// 'cloud'-Familie (Teil D) und der additiven 'kimi'-Familie (HR16-Paritaet) —
// jeweils mit nicht-leerem label.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner.
import { test, expect } from '@playwright/test'
import { listProviderChoices } from '../../src/main/services/providers-list'

test('liefert genau die 7 Manifest-Provider', () => {
  const choices = listProviderChoices()
  // 7 seit 2026-08-11: grok kam als vierter nativer Loader dazu (HR16-Paritaet).
  expect(choices.length).toBe(7)
})

test('enthaelt die Bestands-Familien + additive cloud- und kimi-Familie', () => {
  const ids = listProviderChoices().map((c) => c.id)
  for (const id of ['shared', 'claude', 'codex', 'local', 'cloud', 'kimi', 'grok']) {
    expect(ids).toContain(id)
  }
})

test('jeder Eintrag hat ein nicht-leeres label', () => {
  for (const c of listProviderChoices()) {
    expect(typeof c.label).toBe('string')
    expect(c.label.length).toBeGreaterThan(0)
  }
})
