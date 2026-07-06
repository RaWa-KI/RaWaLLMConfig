// masked-preview.spec.ts — WP22: Verhaltens-Specs fuer die maskierte
// Struktur-Vorschau (maskedPreview, Owner-Override #11). NUR oeffentliche
// API/Output getestet (WP16 optimiert parallel die Read-Interna — hier keine
// Interna-Asserts). Nur temp-Sandbox-Dateien, NIE reale Configs.
import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { maskedPreview } from '../../src/main/scan/masked-preview'
import { makeSandbox, sandboxPath } from './fixtures'

test('maskedPreview: credential-foermiger Wert -> ••• sichtbar, NIE der Rohwert', () => {
  const sb = makeSandbox()
  const rawValue = 'abc123def456ghi789jkl012' // Test-Dummy, kein echtes Secret
  const p = sandboxPath(sb, 'settings.json')
  writeFileSync(p, JSON.stringify({ apiKey: rawValue, model: 'gpt' }, null, 2), 'utf8')
  const out = maskedPreview(p)
  // Werte maskiert, Keys/Struktur bleiben sichtbar.
  expect(out).toContain('•••')
  expect(out).not.toContain(rawValue)
  expect(out).toContain('"apiKey"')
  expect(out).toContain('"model": "gpt"')
})

test('maskedPreview: >45 Zeilen -> endet auf "… (gekuerzt)"', () => {
  const sb = makeSandbox()
  const p = sandboxPath(sb, 'lang.md')
  const lines = Array.from({ length: 60 }, (_, i) => `zeile-${i}`)
  writeFileSync(p, lines.join('\n'), 'utf8')
  const out = maskedPreview(p)
  expect(out.endsWith('… (gekuerzt)')).toBe(true)
  // Default maxLines=45: zeile-44 noch drin, zeile-45 abgeschnitten.
  expect(out).toContain('zeile-44')
  expect(out).not.toContain('zeile-45')
})

test('maskedPreview: maxChars kuerzt den Output (mit Kuerzungs-Marker)', () => {
  const sb = makeSandbox()
  const p = sandboxPath(sb, 'kurz.md')
  writeFileSync(p, 'abcdefghijklmnop', 'utf8')
  const out = maskedPreview(p, 45, 10)
  expect(out).toBe('abcdefghij\n… (gekuerzt)')
})

test('maskedPreview: nicht lesbare Datei -> leerer String', () => {
  const sb = makeSandbox()
  const out = maskedPreview(join(sb.configDir, 'gibt-es-nicht.json'))
  expect(out).toBe('')
})
