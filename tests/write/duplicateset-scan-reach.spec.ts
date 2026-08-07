// duplicateset-scan-reach.spec.ts — Falsifikations-Beweise zum DuplicateSet-
// Arbeitsstrang (Backlog P1 „Duplikat-Ansicht bleibt leer", PM-Rueckkanal
// 20260728T152100Z). Belegt ZWEI strukturelle Gruende, warum die reale
// Scan-Pipeline kein DuplicateSet erzeugt — jeweils als IST-Pin mit Soll-Notiz:
//   (1) scanDir ist FLACH: eine verschachtelte Mirror-Kopie (skills/mirror/<n>)
//       wird nie zweiter gleichnamiger Entry — die Namens-Paarung in
//       findDuplicates kann dafuer strukturell nicht feuern.
//   (2) Die Engine-Merge dedupliziert Entries nach Entry-id (Prefix+Name-Slug):
//       gleichnamige Eintraege aus Nutzer-Zusatzwurzeln (Mehr-Wurzel-Fall)
//       werden still verworfen, BEVOR findDuplicates sie paaren koennte.
//   (3) Soll-Beweis: kaemen beide Vorkommen als Entries an, paart die
//       Erkennung sie korrekt (heuristic-Confidence, Mehr-Wurzel-Pfade).
// ALLE Pfade temp-Sandbox (fixtures-Guard), keine realen Config-Reads ausser
// der reinen Engine-Ausfuehrung gegen die Sandbox.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDuplicates } from '../../src/main/services/dedupe'
import { scanDirGeneric } from '../../src/main/scan/codex-scan'
import { scanProvider } from '../../src/main/scan/engine/scan-engine'
import { setUserSourceProviderRootsProvider } from '../../src/main/services/config-roots'
import { makeSandbox } from './fixtures'
import type { Sandbox } from './fixtures'
import type { Category, ConfigEntry, LlmConfig } from '../../shared/contract'
import type { ProviderManifest } from '../../shared/contract-provider'

function seedSkill(dir: string, body: string): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), body, 'utf8')
}

function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-07-28' }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  setUserSourceProviderRootsProvider(() => ({}))
})

test('(1) IST-Pin: flacher Scan — Mirror-Unterordner wird kein zweiter gleichnamiger Eintrag', () => {
  const sb: Sandbox = makeSandbox()
  const skills = join(sb.root, 'skills')
  // Exakt der Seed aus der Usability-Smoke: Original + Mirror im Unterordner.
  seedSkill(join(skills, 'foo'), '# Foo (Original)')
  seedSkill(join(skills, 'mirror', 'foo'), '# Foo (Spiegel, abweichend)')
  const cat = scanDirGeneric('codex-skills', 'Skills', 'skill', sb.root, 'skills', 'b', 'd', false, 'codex-skills')
  // Der Scan sieht nur die oberste Ebene: 'foo' UND 'mirror' (als Ordner) —
  // niemals zwei Eintraege namens 'foo'.
  expect(cat.entries.map((e) => e.name).sort()).toEqual(['foo', 'mirror'])
  const data: Record<string, LlmConfig> = { codex: { categories: [cat], duplicates: [] } }
  findDuplicates(data)
  expect(data.codex!.duplicates).toEqual([])
})

test('(2) IST-Pin: Engine-Merge verwirft gleichnamige Eintraege aus Zusatzwurzeln', () => {
  const sb: Sandbox = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const extraRoot = join(sb.root, 'extra-codex')
  // Basis-Wurzel (Sandbox .codex) + Nutzer-Zusatzwurzel, beide mit Skill 'foo'.
  seedSkill(join(sb.root, '.codex', 'skills', 'foo'), '# Foo Variante A')
  seedSkill(join(extraRoot, 'skills', 'foo'), '# Foo Variante B (abweichend)')
  setUserSourceProviderRootsProvider(() => ({ codex: [extraRoot] }))
  const skillsOnly: ProviderManifest = {
    id: 'codex',
    label: 'Codex',
    roots: [{ rootKey: 'codexHome' }],
    categories: [{
      id: 'codex-skills', idPrefix: 'codex-skills', label: 'Skills', icon: 'skill',
      blurb: 'b', subdir: 'skills', scan: 'dir', parser: 'frontmatter',
      withContent: false, desc: 'd',
    }],
  }
  const cfg = scanProvider(skillsOnly)
  const cat = cfg.categories.find((c) => c.id === 'codex-skills')!
  // Beide Roots wurden gescannt, aber die Entry-id (Prefix+Name-Slug) kollidiert:
  // die zweite 'foo'-Fassung wird im Merge still verworfen (scan-engine.ts
  // mergeCategories, „erste Entry-Fassung gewinnt"). SOLL bei Merge-Fix: 2.
  expect(cat.entries.filter((e) => e.name === 'foo')).toHaveLength(1)
  const data: Record<string, LlmConfig> = { codex: { ...cfg, duplicates: [] } }
  findDuplicates(data)
  expect(data.codex!.duplicates).toEqual([])
})

test('(3) Soll-Beweis: zwei gleichnamige Vorkommen aus verschiedenen Wurzeln paaren korrekt', () => {
  const sb: Sandbox = makeSandbox()
  const a = join(sb.root, 'wurzel-eins', 'skills')
  const b = join(sb.root, 'wurzel-zwei', 'skills')
  mkdirSync(a, { recursive: true })
  mkdirSync(b, { recursive: true })
  writeFileSync(join(a, 'foo.md'), 'Zeile Original\n', 'utf8')
  writeFileSync(join(b, 'foo.md'), 'Zeile Abweichend\n', 'utf8')
  const cat = mkCat('claude-rules', [
    mkEntry('claude-rules-foo-a', 'foo.md', join(a, 'foo.md')),
    mkEntry('claude-rules-foo-b', 'foo.md', join(b, 'foo.md')),
  ])
  const data: Record<string, LlmConfig> = { claude: { categories: [cat], duplicates: [] } }
  findDuplicates(data)
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.confidence).toBe('heuristic')
  expect(sets[0]!.verdict).toBe('diff')
  expect(sets[0]!.lines.length).toBeGreaterThan(0)
  expect(sets[0]!.masked).toBeUndefined()
})
