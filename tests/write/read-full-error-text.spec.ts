// read-full-error-text.spec.ts — Specs fuer die gemeinsame Fehlertext-Quelle
// (src/renderer/lib/read-full-error-text.ts). Beide Reiter ("Konfiguration"
// und "Detail & Edit") sollen denselben owner-lesbaren Grund zeigen statt
// eines nackten Sammelsatzes.
//
// WICHTIG: Ausschliesslich SYNTHETISCHER Input (Fehlercode-Strings) — kein
// Dateisystem, keine realen Config-Pfade. Damit bleibt die Spec unabhaengig
// von parallelen Aenderungen am Scanner/an echten Pfaden.
import { test, expect } from '@playwright/test'
import {
  isReadFullGuardError,
  readFullErrText,
  READ_FULL_FALLBACK_TEXT,
  READ_FULL_GUARD_ERROR,
  READ_FULL_GUARD_TEXT
} from '../../src/renderer/lib/read-full-error-text'

test('ordner: nennt Ordner statt Datei und sagt, was zu tun ist', () => {
  const text = readFullErrText('ordner')
  expect(text).toContain('Ordner')
  expect(text).toContain('Datei innerhalb des Ordners auswählen')
  expect(text).not.toBe(READ_FULL_FALLBACK_TEXT)
})

test('nicht-gefunden: nennt die fehlende Datei und einen Handlungshinweis', () => {
  const text = readFullErrText('nicht-gefunden')
  expect(text).toContain('gibt es an diesem Ort nicht mehr')
  expect(text).toContain('neu einlesen')
  expect(text).not.toBe(READ_FULL_FALLBACK_TEXT)
})

test('zu-gross: die Groesse aus dem Fehlercode steht sichtbar im Text', () => {
  const text = readFullErrText('zu-gross:13.3 MB')
  expect(text).toContain('13.3 MB')
  expect(text).toContain('zu groß')
  expect(text).toContain('2 MB')
})

test('zu-gross ohne Groessenangabe bleibt verstaendlich (kein leeres Klammerpaar)', () => {
  const text = readFullErrText('zu-gross')
  expect(text).toContain('zu groß')
  expect(text).not.toContain('()')
})

test('weitere distinkte Codes bleiben unterscheidbar', () => {
  const codes = ['ordner', 'nicht-gefunden', 'nicht-lesbar', 'invalid-request', 'zu-gross:1.0 MB']
  const texts = codes.map((code) => readFullErrText(code))
  expect(new Set(texts).size).toBe(codes.length)
  for (const text of texts) expect(text).not.toBe(READ_FULL_FALLBACK_TEXT)
})

test('Secret-Guard bleibt ein eigener Fall und wird nicht verschluckt', () => {
  expect(isReadFullGuardError(READ_FULL_GUARD_ERROR)).toBe(true)
  expect(isReadFullGuardError('ordner')).toBe(false)
  expect(isReadFullGuardError(null)).toBe(false)
  expect(READ_FULL_GUARD_TEXT).toContain('Nur für Eigentümer')
  expect(readFullErrText(READ_FULL_GUARD_ERROR)).toBe(READ_FULL_GUARD_TEXT)
})

test('unbekannter oder fehlender Fehler faellt auf den Auffangtext zurueck', () => {
  expect(readFullErrText(null)).toBe(READ_FULL_FALLBACK_TEXT)
  expect(readFullErrText('irgendwas-neues')).toBe(READ_FULL_FALLBACK_TEXT)
  expect(READ_FULL_FALLBACK_TEXT).toContain('konnte nicht geladen werden')
})
