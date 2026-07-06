// compare-multi.spec.ts — WP22: Verhaltens-Specs fuer den Multi-Way-Vergleich
// (compareMulti): LCS-Pfad bei genau 2 lesbaren Spalten, Praesenz-Union ab 3,
// CRLF/LF-Normalisierung, Whitespace-Filter, Oversize-/Missing-Guards und die
// Secret-Sicherung (displayText-Pfad: NIE roher Secret-Wert im Ergebnis).
// Nur temp-Sandbox-Dateien; reine oeffentliche API, keine Interna-Asserts.
import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareMulti } from '../../src/main/services/compare-multi'
import type { CompareCandidate } from '../../shared/contract-compare'
import { makeSandbox, sandboxPath } from './fixtures'
import type { Sandbox } from './fixtures'

// Kandidat-Fixture: Datei in der Sandbox anlegen und als CompareCandidate liefern.
function seedCandidate(sb: Sandbox, name: string, content: string): CompareCandidate {
  const p = sandboxPath(sb, name)
  writeFileSync(p, content, 'utf8')
  return { id: name, path: p, label: name }
}

test('compareMulti: 2 identische Dateien -> alle Zeilen dup, 0 inkonsistent', () => {
  const sb = makeSandbox()
  const a = seedCandidate(sb, 'a.md', 'eins\nzwei\n')
  const b = seedCandidate(sb, 'b.md', 'eins\nzwei\n')
  const res = compareMulti([a, b])
  expect(res.columns.every((c) => c.available)).toBe(true)
  expect(res.lines.length).toBe(2)
  for (const line of res.lines) {
    expect(line.kind).toBe('dup')
    expect(line.presence).toEqual([true, true])
  }
  expect(res.dupCount).toBe(2)
  expect(res.inconsistentCount).toBe(0)
  expect(res.anyMasked).toBe(false)
})

test('compareMulti: 3 Dateien -> Praesenz-Masken + dup/partial/unique exakt', () => {
  const sb = makeSandbox()
  const a = seedCandidate(sb, 'a.md', 'common\nshared\nonlyA\n')
  const b = seedCandidate(sb, 'b.md', 'common\nshared\n')
  const c = seedCandidate(sb, 'c.md', 'common\nonlyC\n')
  const res = compareMulti([a, b, c])
  // Erstvorkommens-Reihenfolge: Spalte 0 zuerst, dann Neues aus Spalte 2.
  expect(res.lines.map((l) => l.text)).toEqual(['common', 'shared', 'onlyA', 'onlyC'])
  const byText = new Map(res.lines.map((l) => [l.text, l]))
  expect(byText.get('common')!.presence).toEqual([true, true, true])
  expect(byText.get('common')!.kind).toBe('dup')
  expect(byText.get('shared')!.presence).toEqual([true, true, false])
  expect(byText.get('shared')!.kind).toBe('partial')
  expect(byText.get('onlyA')!.presence).toEqual([true, false, false])
  expect(byText.get('onlyA')!.kind).toBe('unique')
  expect(byText.get('onlyC')!.presence).toEqual([false, false, true])
  expect(byText.get('onlyC')!.kind).toBe('unique')
  expect(res.dupCount).toBe(1)
  expect(res.inconsistentCount).toBe(3)
})

test('compareMulti: CRLF vs. LF mit gleichem Text -> gleich (Normalisierung)', () => {
  const sb = makeSandbox()
  const a = seedCandidate(sb, 'crlf.md', 'x\r\ny\r\n')
  const b = seedCandidate(sb, 'lf.md', 'x\ny\n')
  const res = compareMulti([a, b])
  expect(res.lines.length).toBe(2)
  expect(res.lines.every((l) => l.kind === 'dup')).toBe(true)
  expect(res.dupCount).toBe(2)
  expect(res.inconsistentCount).toBe(0)
})

test('compareMulti: whitespace-only Zeilen erzeugen kein Rauschen (Union-Pfad)', () => {
  const sb = makeSandbox()
  // Spalte 0 traegt eine zusaetzliche whitespace-only Zeile — sie darf NICHT
  // als partial/unique-Befund auftauchen (Klassifikations-Ausschluss).
  const a = seedCandidate(sb, 'a.md', 'x\n   \n')
  const b = seedCandidate(sb, 'b.md', 'x\n')
  const c = seedCandidate(sb, 'c.md', 'x\n')
  const res = compareMulti([a, b, c])
  expect(res.lines.length).toBe(1)
  expect(res.lines[0].text).toBe('x')
  expect(res.lines[0].kind).toBe('dup')
  expect(res.lines.some((l) => l.text.trim() === '')).toBe(false)
  expect(res.inconsistentCount).toBe(0)
})

test('compareMulti: >2-MB-Datei -> oversize:true, kein Crash, Rest lesbar', () => {
  const sb = makeSandbox()
  const bigPath = sandboxPath(sb, 'big.md')
  // 2 MB + 1 Byte — knapp ueber dem Groessen-Guard.
  writeFileSync(bigPath, Buffer.alloc(2 * 1024 * 1024 + 1, 0x61))
  const big: CompareCandidate = { id: 'big', path: bigPath, label: 'big.md' }
  const small = seedCandidate(sb, 'small.md', 'zeile\n')
  const res = compareMulti([big, small])
  expect(res.columns[0].oversize).toBe(true)
  expect(res.columns[0].available).toBe(false)
  expect(res.columns[1].available).toBe(true)
  // Nur 1 lesbare Spalte -> kein Quervergleich: praesente Zeilen sind unique.
  expect(res.lines.length).toBe(1)
  expect(res.lines[0].kind).toBe('unique')
  expect(res.lines[0].presence).toEqual([false, true])
})

test('compareMulti: fehlende Datei -> available:false (Platzhalter-Spalte)', () => {
  const sb = makeSandbox()
  const missing: CompareCandidate = {
    id: 'missing',
    path: join(sb.configDir, 'gibt-es-nicht.md'),
    label: 'gibt-es-nicht.md'
  }
  const real = seedCandidate(sb, 'real.md', 'inhalt\n')
  const res = compareMulti([missing, real])
  expect(res.columns[0].available).toBe(false)
  expect(res.columns[0].oversize).toBeUndefined()
  expect(res.columns[1].available).toBe(true)
  expect(res.lines.length).toBe(1)
  expect(res.lines[0].presence).toEqual([false, true])
  expect(res.lines[0].kind).toBe('unique')
})

test('compareMulti: Secret-Datei -> ••• statt Rohwert (displayText-Pfad)', () => {
  const sb = makeSandbox()
  const rawValue = 'abc123def456ghi789jkl012' // Test-Dummy, kein echtes Secret
  const secret = seedCandidate(sb, 'config.toml', `model = "gpt"\ntoken = "${rawValue}"\n`)
  const plain = seedCandidate(sb, 'notes.md', 'model = "gpt"\n')
  const res = compareMulti([secret, plain])
  // Spalten-Status: Secret-Klasse maskiert geladen.
  expect(res.columns[0].masked).toBe(true)
  expect(res.anyMasked).toBe(true)
  // Der Rohwert taucht NIRGENDS im Ergebnis auf; die Token-Zeile traegt •••.
  expect(JSON.stringify(res)).not.toContain(rawValue)
  const tokenLine = res.lines.find((l) => l.text.startsWith('token'))
  expect(tokenLine).toBeDefined()
  expect(tokenLine!.text).toContain('•••')
  expect(tokenLine!.kind).toBe('unique')
})
