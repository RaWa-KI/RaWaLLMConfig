// dedupe-drift-decisions.spec.ts — WP-F12F13: persistierte Drift-Decisions
// (parity/ignored) verwerfen ihr DuplicateSet in der Dedupe-Pipeline.
// Owner-Befund: inhaltsgleiche Cross-Provider-Kopien (~/.claude/skills/<n> vs
// ~/.agents/skills/<n>, gewollte HR16-Paritaet) wurden als „1 Duplikat"
// gezaehlt und der „Paritaets-Kopie"-Klick aenderte weder Anzeige noch
// Zaehler, weil dedupe-content-scan den Decision-Store nie las.
// Alle Pfade temp-Sandbox; Store wird als Stub injiziert (kein Prod-Pfad).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findContentDuplicates } from '../../src/main/services/dedupe-content-scan'
import { hiddenDecisionKeys, isHiddenByDecision } from '../../src/main/services/dedupe-set-builder'
import { driftRelationKey } from '../../shared/contract-drift'
import type { DriftDecision, DriftDecisionRecord } from '../../shared/contract-drift'
import { setUserSourceProviderRootsProvider } from '../../src/main/services/config-roots'
import { makeSandbox } from './fixtures'
import type { Sandbox } from './fixtures'
import type { Category, DuplicateSet, LlmConfig } from '../../shared/contract'

function seed(rel: string, content: string, sb: Sandbox): string {
  const full = join(sb.root, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf8')
  return full
}

function mkCat(id: string): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries: [] }
}

// Identischer Skill in ~/.claude UND ~/.agents (Cross-Root-Paritaets-Kopie);
// .agents wird als Nutzer-Zusatzquelle der claude-Familie mitgescannt.
function setupParityCopy(sb: Sandbox): Record<string, LlmConfig> {
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  seed('.claude/skills/foo/SKILL.md', '# Foo — Paritaets-Kopie\n', sb)
  seed('.agents/skills/foo/SKILL.md', '# Foo — Paritaets-Kopie\n', sb)
  setUserSourceProviderRootsProvider(() => ({ claude: [join(sb.root, '.agents')] }))
  return { claude: { categories: [mkCat('skills')], duplicates: [] } }
}

function storeWith(decision: DriftDecision | null) {
  const records: DriftDecisionRecord[] = decision
    ? [{ key: driftRelationKey('skills', 'foo', ['claude', 'agents']), decision, decidedAt: '2026-08-07T00:00:00Z' }]
    : []
  return { readDecisions: () => records }
}

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  setUserSourceProviderRootsProvider(() => ({}))
})

test('Cross-Root-Kopie + Decision parity -> Set verworfen, duplicates leer', () => {
  const sb = makeSandbox()
  const data = setupParityCopy(sb)
  findContentDuplicates(data, storeWith('parity'))
  expect(data.claude!.duplicates).toEqual([])
})

test('Cross-Root-Kopie + Decision ignored -> Set verworfen, duplicates leer', () => {
  const sb = makeSandbox()
  const data = setupParityCopy(sb)
  findContentDuplicates(data, storeWith('ignored'))
  expect(data.claude!.duplicates).toEqual([])
})

test('Cross-Root-Kopie + Decision duplicate -> Set BLEIBT (Zaehler unveraendert)', () => {
  const sb = makeSandbox()
  const data = setupParityCopy(sb)
  findContentDuplicates(data, storeWith('duplicate'))
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.name).toBe('foo')
  expect(sets[0]!.verdict).toBe('same')
})

test('Cross-Root-Kopie OHNE Decision -> Set bleibt (Default-Verhalten unveraendert)', () => {
  const sb = makeSandbox()
  const data = setupParityCopy(sb)
  findContentDuplicates(data, storeWith(null))
  expect(data.claude!.duplicates).toHaveLength(1)
})

test('Zaehler-Pfad: family.duplicates enthaelt verworfene Sets nicht, andere Sets bleiben', () => {
  const sb = makeSandbox()
  const data = setupParityCopy(sb)
  // Zweites, entscheidungsloses Paar im selben Familien-Baum.
  seed('.claude/rules/dup.md', 'Regel identisch\n', sb)
  seed('.claude/rules/backup/dup.md', 'Regel identisch\n', sb)
  data.claude!.categories.push(mkCat('rules'))
  findContentDuplicates(data, storeWith('parity'))
  const sets = data.claude!.duplicates
  expect(sets).toHaveLength(1)
  expect(sets[0]!.name).toBe('dup.md') // nur das nicht-parity Set bleibt
  expect(sets.some((s) => s.name === 'foo')).toBe(false)
})

test('Filter-Helper: Set mit nicht zuordenbaren Pfaden wird nie verborgen', () => {
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const hidden = hiddenDecisionKeys([
    { key: driftRelationKey('skills', 'foo', ['claude', 'agents']), decision: 'parity', decidedAt: '2026-08-07T00:00:00Z' },
  ])
  const intraRoot: DuplicateSet = {
    cat: 'skills',
    name: 'foo',
    verdict: 'same',
    trunk: { path: join(sb.root, '.claude', 'skills', 'foo'), updated: '' },
    mirror: { path: join(sb.root, '.claude', 'skills', 'mirror', 'foo'), updated: '' },
    note: '',
    lines: [],
  }
  expect(isHiddenByDecision(intraRoot, hidden)).toBe(false) // beide Seiten Root 'claude'
  const crossRoot: DuplicateSet = {
    ...intraRoot,
    mirror: { path: join(sb.root, '.agents', 'skills', 'foo'), updated: '' },
  }
  expect(isHiddenByDecision(crossRoot, hidden)).toBe(true)
})
