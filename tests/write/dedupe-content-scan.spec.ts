// dedupe-content-scan.spec.ts — Plan C: inhaltsbasierte Duplikat-Erkennung.
// Belegt die zuverlaessige Anzeige von Duplikat-Zeilen UNABHAENGIG von Namen,
// Flach-Scan und Engine-Merge (fdupes-Pipeline: Groessen-Bucket -> SHA-256 ->
// Hash-Gruppen -> Item-Anker -> buildDuplicateSet). Alle Pfade temp-Sandbox;
// RAWALLM_SANDBOX_ROOT lenkt configRoots() in den Temp-Baum.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findContentDuplicates } from '../../src/main/services/dedupe-content-scan'
import { scanAll } from '../../src/main/scan/scan-index'
import { setUserSourceProviderRootsProvider } from '../../src/main/services/config-roots'
import { makeSandbox } from './fixtures'
import type { Sandbox } from './fixtures'
import type { Category, LlmConfig } from '../../shared/contract'

function seed(rel: string, content: string, sb: Sandbox): string {
  const full = join(sb.root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

function mkCat(id: string): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries: [] }
}

// Sandbox-Env + Familienhuellen (claude/codex/shared mit den Bestands-Kategorie-ids).
function setup(sb: Sandbox): Record<string, LlmConfig> {
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  return {
    claude: { categories: [mkCat('skills'), mkCat('rules')], duplicates: [] },
    codex: { categories: [mkCat('codex-skills')], duplicates: [] },
    shared: { categories: [mkCat('shared-skills'), mkCat('shared-rules')], duplicates: [] },
  }
}

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  setUserSourceProviderRootsProvider(() => ({}))
})

test('verschachtelter Mirror (Smoke-Fall): identisches Manifest -> Ordner-Paar trotz flachem Scan', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  // Exakt der bisher unsichtbare Seed: skills/<n> + skills/mirror/<n>.
  const manifest = '# Spiegel-Paar\n\nOriginal-Inhalt.\n'
  seed('.claude/skills/foo/SKILL.md', manifest, sb)
  seed('.claude/skills/foo/body.md', 'Zeile A — Original\nZeile B gemeinsam\n', sb)
  seed('.claude/skills/mirror/foo/SKILL.md', manifest, sb)
  seed('.claude/skills/mirror/foo/body.md', 'Zeile A — Spiegel-Variante\nZeile B gemeinsam\n', sb)
  findContentDuplicates(data)
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.name).toBe('foo')
  expect(sets[0]!.cat).toBe('skills')
  expect(sets[0]!.confidence).toBe('content-hash')
  expect(sets[0]!.verdict).toBe('diff') // body.md weicht ab
  expect(sets[0]!.dir).toBeDefined()
  expect(sets[0]!.dir!.diffCount).toBe(1)
})

test('Einzeldatei-Paar: identische Rule in Unterordner ohne Manifest -> Datei-Paar (same)', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  seed('.claude/rules/dup.md', 'Regel-Text identisch\n', sb)
  seed('.claude/rules/backup/dup.md', 'Regel-Text identisch\n', sb)
  findContentDuplicates(data)
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.name).toBe('dup.md')
  expect(sets[0]!.cat).toBe('rules')
  expect(sets[0]!.verdict).toBe('same')
  expect(sets[0]!.dir).toBeUndefined()
  expect(sets[0]!.lines.length).toBeGreaterThan(0)
})

test('Mehr-Wurzel-Fall: identischer Skill in Nutzer-Zusatzquelle -> Paar trotz Merge-Drop', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  const extra = join(sb.root, 'extra-claude')
  seed('.claude/skills/foo/SKILL.md', '# Foo identisch\n', sb)
  mkdirSync(join(extra, 'skills', 'foo'), { recursive: true })
  writeFileSync(join(extra, 'skills', 'foo', 'SKILL.md'), '# Foo identisch\n', 'utf8')
  setUserSourceProviderRootsProvider(() => ({ claude: [extra] }))
  findContentDuplicates(data)
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.verdict).toBe('same')
  expect(sets[0]!.confidence).toBe('content-hash')
})

test('Ausschluesse: Secret-Namen, Punkt-Dateien und 0-Byte erzeugen kein Set', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  seed('.claude/skills/foo/.env', 'SECRET=x\n', sb)
  seed('.claude/skills/mirror/foo/.env', 'SECRET=x\n', sb)
  seed('.claude/rules/.hidden.md', 'gleich\n', sb)
  seed('.claude/rules/backup/.hidden.md', 'gleich\n', sb)
  seed('.claude/rules/leer-a.md', '', sb)
  seed('.claude/rules/backup/leer-b.md', '', sb)
  findContentDuplicates(data)
  expect(data.claude!.duplicates).toEqual([])
})

// Owner-Befund 2026-08-07: Plugin-Baeume sind Installationsbestand mit by
// design identischen vendored Dateien — sie duerfen keine Duplikat-Sets tragen.
test('plugins-Baum ist ausgenommen: identische Plugin-Dateien -> kein Set', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  seed('.claude/plugins/tool-a/prompts.py', 'print("gleich")', sb)
  seed('.claude/plugins/cache/tool-a/prompts.py', 'print("gleich")', sb)
  findContentDuplicates(data, { readDecisions: () => [] })
  expect(data.claude.duplicates).toHaveLength(0)
})

// Owner-Befund 2026-08-07: Zusatzquelle identisch mit Basis-Wurzel liess
// jeden Baum doppelt walken/hashen — Wurzeln muessen dedupliziert sein.
test('Zusatzquelle == Basis-Wurzel: kein Doppel-Walk, keine Selbst-Paare', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  seed('.claude/skills/solo/SKILL.md', 'einzigartiger Inhalt ohne Kopie', sb)
  setUserSourceProviderRootsProvider(() => ({ claude: [join(sb.root, '.claude')] }))
  findContentDuplicates(data, { readDecisions: () => [] })
  expect(data.claude.duplicates).toHaveLength(0)
})

test('kein False-Positive: gleiche Groesse, verschiedener Inhalt -> kein Set', () => {
  const sb = makeSandbox()
  const data = setup(sb)
  seed('.claude/rules/a.md', 'AAAA\n', sb)
  seed('.claude/rules/b.md', 'BBBB\n', sb)
  findContentDuplicates(data)
  expect(data.claude!.duplicates).toEqual([])
})

test('End-to-end: scanAll liefert das Mirror-Paar in der Familien-Pipeline', () => {
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const manifest = '# Spiegel-Paar e2e\n'
  seed('.claude/skills/foo/SKILL.md', manifest, sb)
  seed('.claude/skills/mirror/foo/SKILL.md', manifest, sb)
  const app = scanAll()
  const sets = app.data.claude?.duplicates ?? []
  const hit = sets.find((s) => s.name === 'foo' && s.confidence === 'content-hash')
  expect(hit).toBeDefined()
  expect(hit!.cat).toBe('skills')
  expect(hit!.verdict).toBe('same')
})
