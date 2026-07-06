// cloud-key-mask.spec.ts — D4: reale Cloud-API-Key-Formate (OpenAI/Anthropic/
// Google) werden in der Anzeige-Maskierung als WERT erkannt und maskiert, auch
// wenn sie NACKT (ohne secret-Key-Praefix) in einem Config-Text stehen. Zugleich
// Falschpositiv-Schutz: ${VAR}-/%VAR%-Refs bleiben sichtbar, normale Doku/Prosa/
// Wikilinks/das blosse Wort `sk` werden NICHT zerstoert.
//
// Key-Formate per WebSearch (Stand 2026) verifiziert:
//   OpenAI    sk-proj-… / sk-svcacct- / sk-admin- (+ legacy sk-…)
//   Anthropic sk-ant-api03-… (~108 Z) / sk-ant-oat01-…
//   Google    AIza + 35 Z [A-Za-z0-9_-] = 39 Z gesamt.
// ALLE Key-Werte hier sind OFFENSICHTLICHE FAKE-Dummies, NIE echte Keys.
import { test, expect } from '@playwright/test'
import { maskSecrets } from '../../src/main/services/secret-mask'

const MASK = '•••'

// Fake-Cloud-Keys (Format-treu, aber eindeutig Dummy: 'DUMMY'/wiederholte Muster).
const FAKE_OPENAI = 'sk-proj-DUMMYaaaa1111bbbb2222cccc3333dddd4444eeee5555'
const FAKE_ANTHROPIC = 'sk-ant-api03-DUMMYaaaabbbbccccddddeeeeffff0000111122223333'
const FAKE_GEMINI = 'AIzaSyDUMMY_aaaa1111bbbb2222cccc3333ddd' // 39 Z, AIza-Format

// 1. Nackte Cloud-Keys (kein secret-Key-Praefix) -> als Wert maskiert.
test('D4: nackte OpenAI/Anthropic/Google-Keys werden maskiert', () => {
  const cases: ReadonlyArray<[string, string]> = [
    ['OpenAI', FAKE_OPENAI],
    ['Anthropic', FAKE_ANTHROPIC],
    ['Google/Gemini', FAKE_GEMINI]
  ]
  for (const [label, key] of cases) {
    // In einem harmlosen Wert-Kontext (nackte Zuweisung ohne secret-Key-Name).
    const src = `note = "${key}"`
    const { masked, maskedCount } = maskSecrets(src)
    expect(masked, `${label}-Key nicht mehr im Output`).not.toContain(key)
    expect(masked, `${label}-Maske gesetzt`).toContain(MASK)
    expect(maskedCount, `${label}-maskedCount>=1`).toBeGreaterThanOrEqual(1)
  }
})

// 1b. Cloud-Keys auch als JSON-Blattwert unter HARMLOSEM Key maskiert.
test('D4: Cloud-Keys als JSON-Wert unter harmlosem Key maskiert', () => {
  const src = JSON.stringify({ note: FAKE_ANTHROPIC, gem: FAKE_GEMINI, label: 'short' })
  const { masked, maskedCount } = maskSecrets(src)
  expect(masked).not.toContain(FAKE_ANTHROPIC)
  expect(masked).not.toContain(FAKE_GEMINI)
  expect(masked).toContain('"label": "short"') // harmlos bleibt
  expect(maskedCount).toBeGreaterThanOrEqual(2)
})

// 2. Falschpositiv-Schutz: ${VAR}/%VAR% bleiben sichtbar (bereits migriert).
test('D4: ${VAR}/%VAR%-Refs bleiben sichtbar (kein Over-Masking)', () => {
  const refs = [
    'OPENAI_API_KEY=${OPENAI_API_KEY}',
    'GEMINI_API_KEY=%GEMINI_API_KEY%'
  ].join('\n')
  const { masked, maskedCount } = maskSecrets(refs)
  expect(masked).toContain('${OPENAI_API_KEY}')
  expect(masked).toContain('%GEMINI_API_KEY%')
  expect(maskedCount).toBe(0)
})

// 3. Falschpositiv-Schutz: Doku/Prosa/Wikilinks/`sk` allein NICHT zerstoert.
test('D4: legitime Doku/Prosa/Wikilinks/sk-allein nicht maskiert', () => {
  const doc = [
    'Setze deinen Key in die Env-Variable, dann nutzt die App sk-Prefix-Keys.',
    'Siehe [[credentials-protection]] und VALIDATED_REFERENCE-namespace-konvention.',
    'Das Wort sk allein und AI sind harmlos; auch AIzustand ist Prosa.',
    'Markdown-Satz ohne jeden Key bleibt byte-identisch.'
  ].join('\n')
  const { masked, maskedCount } = maskSecrets(doc)
  expect(maskedCount).toBe(0)
  expect(masked).toBe(doc) // nichts zerstoert
})

// 3b. `AIza`-Praefix in einem normalen Wort (zu kurz/kein Key) bleibt sichtbar.
test('D4: AIza-Praefix in Prosa (kein 39-Z-Key) bleibt sichtbar', () => {
  const src = 'beschreibung = "AIza ist ein Praefix, AIzaBeispiel kein Key"'
  const { masked, maskedCount } = maskSecrets(src)
  expect(maskedCount).toBe(0)
  expect(masked).toBe(src)
})
