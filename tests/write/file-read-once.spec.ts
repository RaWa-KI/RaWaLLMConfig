// file-read-once.spec.ts — Scan-Fundament (WP15): readFileOnce-Snapshot,
// Size-Cap, Secret-Skip, Format-Paritaet der Metadaten (mtimeIso/sizeKb wie
// mtimeSafe/sizeKbSafe — UI-fields haengen daran), Paritaet
// extractSearchKeysFromText <-> extractSearchKeys und readPreview-Cap.
// Reine Node-Sandbox-Tests (mkdtempSync via fixtures), NIE reale Config.
import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { readFileOnce, MAX_SCAN_BYTES } from '../../src/main/scan/file-read-once'
import { readPreview } from '../../src/main/scan/scan-helpers'
import {
  extractSearchKeys,
  extractSearchKeysFromText,
} from '../../src/main/scan/content-index'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'

// ── readFileOnce: Snapshot + Metadaten-Format ──────────────────────────────

test('Datei < Cap: text gesetzt, size/sizeKb/mtimeIso exakt im Bestands-Format', () => {
  const sb: Sandbox = makeSandbox()
  const content = '# Hallo\nzeile zwei\n'
  const p = seedFile(sb, 'klein.md', content)
  const snap = readFileOnce(p)
  expect(snap).not.toBeNull()
  expect(snap!.text).toBe(content)
  const st = fs.statSync(p)
  expect(snap!.size).toBe(st.size)
  // Format-Paritaet: sizeKb wie sizeKbSafe ((size/1024).toFixed(1)),
  // mtimeIso wie mtimeSafe (toISOString().slice(0,10)).
  expect(snap!.sizeKb).toBe((st.size / 1024).toFixed(1))
  expect(snap!.mtimeIso).toBe(st.mtime.toISOString().slice(0, 10))
  expect(snap!.mtimeIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('Datei > Cap (300 KB): text undefined, Metadaten trotzdem gesetzt', () => {
  const sb: Sandbox = makeSandbox()
  const big = Buffer.alloc(300 * 1024, 'a')
  expect(big.length).toBeGreaterThan(MAX_SCAN_BYTES)
  const p = path.join(sb.configDir, 'riese.md')
  fs.writeFileSync(p, big)
  const snap = readFileOnce(p)
  expect(snap).not.toBeNull()
  expect(snap!.text).toBeUndefined()
  expect(snap!.size).toBe(big.length)
  expect(snap!.sizeKb).toBe((big.length / 1024).toFixed(1))
  expect(snap!.mtimeIso).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

test('Secret-Endung (foo.env): text undefined, Metadaten gesetzt', () => {
  const sb: Sandbox = makeSandbox()
  const p = seedFile(sb, 'foo.env', 'API_KEY=sk-NIE-LESEN\n')
  const snap = readFileOnce(p)
  expect(snap).not.toBeNull()
  expect(snap!.text).toBeUndefined()
  expect(snap!.size).toBeGreaterThan(0)
})

test('nicht existenter Pfad: null, wirft nie', () => {
  const sb: Sandbox = makeSandbox()
  expect(readFileOnce(path.join(sb.configDir, 'gibt-es-nicht.md'))).toBeNull()
})

// ── Paritaet: extractSearchKeysFromText(p, text) === extractSearchKeys(p) ──

test('Paritaet .md: extractSearchKeysFromText(vorgelesen) deep-equal extractSearchKeys', () => {
  const sb: Sandbox = makeSandbox()
  const md = ['---', 'title: X', 'model: y', '---', '# Heading Eins', 'Body', '## Heading Zwei'].join('\n')
  const p = seedFile(sb, 'fixture.md', md)
  const snap = readFileOnce(p)
  expect(snap?.text).toBeDefined()
  expect(extractSearchKeysFromText(p, snap!.text)).toEqual(extractSearchKeys(p))
})

test('Paritaet .json: extractSearchKeysFromText(vorgelesen) deep-equal extractSearchKeys', () => {
  const sb: Sandbox = makeSandbox()
  const json = JSON.stringify({ alpha: 1, nested: { beta: ['x'] } })
  const p = seedFile(sb, 'fixture.json', json)
  const snap = readFileOnce(p)
  expect(snap?.text).toBeDefined()
  expect(extractSearchKeysFromText(p, snap!.text)).toEqual(extractSearchKeys(p))
})

test('Paritaet text=undefined (>Cap/Secret): Fallback identisch zu extractSearchKeys', () => {
  const sb: Sandbox = makeSandbox()
  // Secret-Pfad: readFileOnce liefert text undefined -> readForIndex-Fallback
  // (maskierter Pfad) bleibt unveraendert die gemeinsame Quelle.
  const p = seedFile(sb, 'bar.env', 'TOKEN=abc\n')
  const snap = readFileOnce(p)
  expect(snap?.text).toBeUndefined()
  expect(extractSearchKeysFromText(p, snap?.text)).toEqual(extractSearchKeys(p))
})

// ── readPreview: Size-Cap greift (nur Scan-Preview; readFull ungecappt) ────

test('readPreview auf >Cap-Datei: undefined (Cap via readTextSafe)', () => {
  const sb: Sandbox = makeSandbox()
  const p = path.join(sb.configDir, 'riese2.md')
  fs.writeFileSync(p, Buffer.alloc(300 * 1024, 'b'))
  expect(readPreview(p)).toBeUndefined()
  // Kontrolle: kleine Datei liefert weiterhin eine Vorschau.
  const klein = seedFile(sb, 'klein2.md', '# Titel\ninhalt\n')
  expect(readPreview(klein)).toContain('# Titel')
})
