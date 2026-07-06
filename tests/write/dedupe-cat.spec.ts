// dedupe-cat.spec.ts — Kategorie-Achse der internen Tool-Duplikat-Erkennung (read-only).
// Sichert die Regression-Fix-Semantik nach WP-03-Narrowing (Cross-Tool -> Coverage):
//   - Cross-Tool-Paare (claude<->shared, codex<->shared) sind KEINE Duplicates mehr.
//     Sie wandern in die Coverage-Sicht (coverage.spec.ts) — die migrierten Assertions
//     stehen dort. HR7: keine Erwartung ersatzlos gestrichen — migriert.
//   - 'rules' <-> 'shared-skills' paart NICHT (Kategorie-Achse haelt, beide Richtungen).
//   - _memory bleibt gefiltert.
// ALLE Pfade liegen in einer temp-Sandbox (NIE reale Config); Inhalte sind Dummy.
import { test, expect } from '@playwright/test'
import { findDuplicates } from '../../src/main/services/dedupe'
import { normalizeCat } from '../../shared/cat-key'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'
import type { ConfigEntry, Category, LlmConfig } from '../../shared/contract'

// Minimal-Entry mit absolutem Sandbox-Pfad (resolvePath verlangt absolut).
function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-06-07' }
}

// Eine Kategorie mit gegebener id + Entries bauen.
function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

// Eine Familie (LlmConfig) aus Kategorien bauen.
function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

// Hilfsfunktion: liefert alle DuplicateSets ueber alle Familien flach.
function allSets(data: Record<string, LlmConfig>) {
  return Object.values(data).flatMap((f) => f.duplicates)
}

test('normalizeCat strippt userglobal-Toolpraefixe auf dieselbe Kategorie-Achse', () => {
  expect(normalizeCat('userglobal-claude-skills')).toBe('skills')
  expect(normalizeCat('userglobal-codex-hooks')).toBe('hooks')
  expect(normalizeCat('shared-skills')).toBe('skills')
  expect(normalizeCat('codex-skills')).toBe('skills')
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] rules (claude) <-> shared-rules').
// WP-03-Narrowing: Cross-Tool-Paare (claude<->shared) sind keine Duplicates mehr.
// Neues Soll: findDuplicates liefert 0 Sets fuer cross-family; Coverage liefert die Row.
test('rules (claude) <-> shared-rules (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-foo.md', 'IDENTISCH\n')
  const sharedPath = seedFile(sb, 'shared-foo.md', 'IDENTISCH\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('rules', [mkEntry('rule-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-rules', [mkEntry('shared-rules-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  // Cross-Familie (claude<->shared) ist nach WP-03 kein Duplicate mehr.
  // Die Coverage-Sicht (buildCoverage) liefert die Row — Assertion dort.
  expect(allSets(data)).toHaveLength(0)
})

test('rules (claude) <-> shared-skills (shared): KEIN Paar (Kategorie-Achse haelt)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-bar.md', 'A\n')
  const sharedPath = seedFile(sb, 'shared-bar.md', 'A\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('rules', [mkEntry('rule-bar', 'bar', claudePath)])]),
    shared: mkFamily([mkCat('shared-skills', [mkEntry('shared-skills-bar', 'bar', sharedPath)])]),
  }
  findDuplicates(data)
  // Achse 'rules' != 'skills' -> kein Cross-Kategorie-Falschpositiv.
  expect(allSets(data)).toHaveLength(0)
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] instructions <-> shared-instructions').
// WP-03-Narrowing: Cross-Tool-Paare liefern 0 Duplicates; Coverage zeigt 'abweichend'.
test('instructions <-> shared-instructions: KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'CLAUDE.md', 'CLAUDE-INHALT\n')
  const sharedPath = seedFile(sb, 'shared-CLAUDE.md', 'SHARED-INHALT-ANDERS\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('instructions', [mkEntry('instr-claude-md', 'CLAUDE.md', claudePath)])]),
    shared: mkFamily([mkCat('shared-instructions', [mkEntry('shared-instr-CLAUDE.md', 'CLAUDE.md', sharedPath)])]),
  }
  findDuplicates(data)
  // Cross-Familie ist kein Duplicate — abweichender Inhalt wird in Coverage sichtbar.
  expect(allSets(data)).toHaveLength(0)
})

// ── WP-03-Narrowing: Cross-Tool-Paare sind KEINE Duplicates mehr ──────────
// claude<->shared und codex<->shared sind Cross-Tool-Abdeckung (Coverage).
// Die zugehoerigen Assertions wurden nach coverage.spec.ts migriert (HR7: keine
// Erwartung ersatzlos gestrichen). Altes Framing ('paart (Achse agents)') ist
// damit ueberholt — alle 5 Faelle erwarten jetzt 0 Sets.

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] agents (claude) <-> shared-agents').
test('agents (claude) <-> shared-agents (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-agent.md', 'GLEICH\n')
  const sharedPath = seedFile(sb, 'shared-agent.md', 'GLEICH\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('agents', [mkEntry('agent-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-agents', [mkEntry('shared-agents-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  expect(allSets(data)).toHaveLength(0)
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] hooks (claude) <-> shared-hooks').
test('hooks (claude) <-> shared-hooks (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-hook.cjs', 'H\n')
  const sharedPath = seedFile(sb, 'shared-hook.cjs', 'H\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('hooks', [mkEntry('hook-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-hooks', [mkEntry('shared-hooks-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  expect(allSets(data)).toHaveLength(0)
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] teams (claude) <-> shared-teams').
test('teams (claude) <-> shared-teams (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-team.json', 'T\n')
  const sharedPath = seedFile(sb, 'shared-team.json', 'T\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('teams', [mkEntry('team-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-teams', [mkEntry('shared-teams-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  expect(allSets(data)).toHaveLength(0)
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] plugins (claude) <-> shared-plugins').
test('plugins (claude) <-> shared-plugins (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-plugin.json', 'P\n')
  const sharedPath = seedFile(sb, 'shared-plugin.json', 'P\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('plugins', [mkEntry('plugin-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-plugins', [mkEntry('shared-plugins-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  expect(allSets(data)).toHaveLength(0)
})

// MIGRIERT nach coverage.spec.ts ('[MIGRATION] codex-agents (codex) <-> shared-agents').
test('codex-agents (codex) <-> shared-agents (shared): KEIN Duplicate-Set (Cross-Tool -> Coverage)', () => {
  const sb: Sandbox = makeSandbox()
  const codexPath = seedFile(sb, 'codex-agent.md', 'C\n')
  const sharedPath = seedFile(sb, 'shared-codex-agent.md', 'C\n')
  const data: Record<string, LlmConfig> = {
    codex: mkFamily([mkCat('codex-agents', [mkEntry('codex-agents-foo', 'foo', codexPath)])]),
    shared: mkFamily([mkCat('shared-agents', [mkEntry('shared-agents-foo', 'foo', sharedPath)])]),
  }
  findDuplicates(data)
  // normalizeCat strippt 'codex-' und 'shared-' -> Achse 'agents'; aber Cross-Familie -> 0 Sets.
  expect(allSets(data)).toHaveLength(0)
})

test('codex-hooks (codex) <-> shared-skills (shared): KEIN Paar trotz Strip (Achse haelt)', () => {
  const sb: Sandbox = makeSandbox()
  const codexPath = seedFile(sb, 'codex-x.toml', 'X\n')
  const sharedPath = seedFile(sb, 'shared-x.md', 'X\n')
  const data: Record<string, LlmConfig> = {
    codex: mkFamily([mkCat('codex-hooks', [mkEntry('codex-hooks-x', 'x', codexPath)])]),
    shared: mkFamily([mkCat('shared-skills', [mkEntry('shared-skills-x', 'x', sharedPath)])]),
  }
  findDuplicates(data)
  // Nach Strip: 'hooks' != 'skills' -> Kategorie-Achse verhindert Falschpositiv.
  expect(allSets(data)).toHaveLength(0)
})

test('_memory-Eintraege bleiben gefiltert (kein Set)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mem-claude.md', 'M\n')
  const sharedPath = seedFile(sb, 'mem-shared.md', 'M\n')
  // Pfade enthalten /_memory/ -> isMemoryEntry filtert sie vor collectByName aus.
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('agents', [
      { ...mkEntry('agent-mem', 'mem', claudePath), path: claudePath.replace('mem-claude.md', '_memory/mem-claude.md') },
    ])]),
    shared: mkFamily([mkCat('shared-agents', [
      { ...mkEntry('shared-agents-mem', 'mem', sharedPath), path: sharedPath.replace('mem-shared.md', '_memory/mem-shared.md') },
    ])]),
  }
  findDuplicates(data)
  expect(allSets(data)).toHaveLength(0)
})
