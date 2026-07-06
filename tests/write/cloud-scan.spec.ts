// cloud-scan.spec.ts — WP-D3: der Cloud-Scanner zeigt den Env-Key-STATUS, ohne je
// den Key-WERT zu tragen. Kernbeweise:
//  (1) Env gesetzt -> OpenAI-Key-Status 'gesetzt' (fields.Status), status 'active'.
//  (2) LEAK-NEGATIVTEST: der gesetzte Dummy-Wert taucht in JSON.stringify(result)
//      NIRGENDS auf (kein Wert-Leak in id/name/desc/fields).
//  (3) Env nicht gesetzt -> Status 'nicht gesetzt', status 'stale'.
// Lauf via scanProvider(cloudManifest) (Engine, roots: [] -> synthetische Basis).
// Der Dummy-Wert ist ein offensichtlicher Test-Marker, KEIN echter Key.
import { test, expect } from '@playwright/test'
import { scanProvider } from '../../src/main/scan/engine/scan-engine'
import { cloudManifest } from '../../src/main/scan/manifests/cloud.manifest'

const DUMMY = 'dummy'

// Env nach JEDEM Test wieder loeschen, damit kein Test den naechsten faerbt.
test.afterEach(() => {
  delete process.env.OPENAI_API_KEY
})

test('D3: gesetzte OPENAI_API_KEY -> OpenAI-Key-Status "gesetzt", status active', () => {
  process.env.OPENAI_API_KEY = DUMMY
  const result = scanProvider(cloudManifest)
  const openai = result.categories.find((c) => c.id === 'cloud-openai')!
  expect(openai, 'OpenAI-Kategorie vorhanden').toBeTruthy()
  const key = openai.entries.find((e) => e.id === 'cloud-openai-key')!
  expect(key.fields?.['Status'], 'Status-Feld = gesetzt').toBe('gesetzt')
  expect(key.status, 'EntryStatus active bei gesetztem Key').toBe('active')
  expect(key.desc, 'desc nennt nur Maskierung, nicht den Wert').toBe('Gesetzt (Wert maskiert)')
})

test('D3 LEAK-NEGATIVTEST: der gesetzte Dummy-Wert kommt im Ergebnis NICHT vor', () => {
  process.env.OPENAI_API_KEY = DUMMY
  const result = scanProvider(cloudManifest)
  const serialized = JSON.stringify(result)
  expect(serialized.includes(DUMMY), 'Key-Wert darf nirgends im Output stehen').toBe(false)
})

test('D3: ohne gesetzte Env -> OpenAI-Key-Status "nicht gesetzt", status stale', () => {
  delete process.env.OPENAI_API_KEY
  const result = scanProvider(cloudManifest)
  const openai = result.categories.find((c) => c.id === 'cloud-openai')!
  const key = openai.entries.find((e) => e.id === 'cloud-openai-key')!
  expect(key.fields?.['Status']).toBe('nicht gesetzt')
  expect(key.status).toBe('stale')
})

test('D3: alle drei Provider als Kategorie, Reihenfolge OpenAI/Anthropic/Gemini', () => {
  const result = scanProvider(cloudManifest)
  expect(result.categories.map((c) => c.id)).toEqual(['cloud-openai', 'cloud-anthropic', 'cloud-gemini'])
})
