// coverage.spec.ts — Spiegelungs-Matrix (buildCoverage) gegen Sandbox-Fixtures.
// Bidirektionale Coverage-Logik (WP-02) + Migration der 7 brechenden Cross-Tool-
// Assertions aus dedupe-cat.spec.ts (WP-03-Narrowing: claude/codex<->shared -> Coverage).
// ALLE Pfade liegen in temp-Sandbox (NIE reale Config). Inhalte sind Dummy.
import { test, expect } from '@playwright/test'
import { buildCoverage } from '../../src/main/services/coverage'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'
import type { ConfigEntry, Category, LlmConfig, CoverageRow } from '../../shared/contract'

// Minimal-Entry mit absolutem Sandbox-Pfad.
function mkEntry(id: string, name: string, absPath: string, extra?: Partial<ConfigEntry>): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-06-09', ...extra }
}

// Eine Kategorie mit gegebener id + Entries bauen.
function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

// Eine Familie (LlmConfig) aus Kategorien bauen.
function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

// Hilfsfunktion: findet eine Row nach cat + normalisiertem name.
function findRow(rows: CoverageRow[], cat: string, name: string): CoverageRow | undefined {
  const n = name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '')
  return rows.find((r) => r.cat === cat && r.name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '') === n)
}

// ── Allein-stehende Shared-Config erscheint (kein '< 2'-Skip) ─────────────

test('allein-stehende Shared-Config erscheint in der Coverage-Matrix', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-solo.md', 'SOLO\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-rules', [mkEntry('shared-rules-solo', 'solo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  // Die allein-stehende Shared-Config muss erscheinen.
  const row = findRow(rows, 'rules', 'solo')
  expect(row).toBeDefined()
  // Shared-Zelle: vorhanden (identisch oder vorhanden).
  expect(['identisch', 'vorhanden']).toContain(row!.shared.state)
  // Claude und Codex fehlen (nicht installiert, keine Plugins).
  expect(row!.claude.state).not.toBe('identisch')
  expect(row!.codex.state).toBe('fehlt')
})

// ── Identische Shared<->Codex-Paarung (bidirektional) ─────────────────────

test('Shared<->Codex: identischer Inhalt -> Codex-Zelle identisch', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-rules-foo.md', 'IDENTISCH\n')
  const codexPath = seedFile(sb, 'codex-rules-foo.md', 'IDENTISCH\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-rules', [mkEntry('sr-foo', 'foo', sharedPath)])]),
    codex: mkFamily([mkCat('codex-rules', [mkEntry('cr-foo', 'foo', codexPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'rules', 'foo')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('identisch')
  expect(row!.codex.state).toBe('identisch')
})

test('Shared<->Codex: abweichender Inhalt -> Codex-Zelle abweichend', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-rules-bar.md', 'SHARED-INHALT\n')
  const codexPath = seedFile(sb, 'codex-rules-bar.md', 'CODEX-INHALT-ANDERS\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-rules', [mkEntry('sr-bar', 'bar', sharedPath)])]),
    codex: mkFamily([mkCat('codex-rules', [mkEntry('cr-bar', 'bar', codexPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'rules', 'bar')
  expect(row).toBeDefined()
  expect(row!.codex.state).toBe('abweichend')
})

// ── Nur-Codex-Config (kein Shared-Pendant) ────────────────────────────────

test('Tool-only-Config (nur Codex): erscheint mit shared=fehlt', () => {
  const sb: Sandbox = makeSandbox()
  const codexPath = seedFile(sb, 'codex-only-agent.md', 'CODEX-ONLY\n')
  const data: Record<string, LlmConfig> = {
    codex: mkFamily([mkCat('codex-agents', [mkEntry('ca-only', 'only-agent', codexPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'agents', 'only-agent')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('fehlt')
  expect(row!.codex.state).not.toBe('fehlt')
})

// ── Nur-Claude-Config (kein Shared-Pendant) ───────────────────────────────

test('Tool-only-Config (nur Claude): erscheint mit shared=fehlt', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-only-rule.md', 'CLAUDE-ONLY\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('rules', [mkEntry('r-only', 'only-rule', claudePath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'rules', 'only-rule')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('fehlt')
  expect(row!.claude.state).not.toBe('fehlt')
})

// ── via-plugin-Asymmetrie ────────────────────────────────────────────────

test('via-plugin: fehlende Claude-Datei + plugin-lieferbare Kat + Plugins -> via-plugin', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-agent-via.md', 'VIA\n')
  // Simuliert eine Claude-Familie mit installiertem Plugin (inventory-Eintrag).
  const pluginEntry = mkEntry('plug-inv', 'installed_plugins.json', seedFile(sb, 'installed_plugins.json', '[]'), {
    inventory: true,
    fields: { typ: 'installed_plugins.json' },
  })
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-via', 'via-agent', sharedPath)])]),
    claude: mkFamily([mkCat('plugins', [pluginEntry])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'agents', 'via-agent')
  expect(row).toBeDefined()
  expect(row!.claude.state).toBe('via-plugin')
})

test('via-plugin: fehlende Claude-Datei + plugin-lieferbare Kat + KEINE Plugins -> n-a', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-agent-na.md', 'NA\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-na', 'na-agent', sharedPath)])]),
    claude: mkFamily([mkCat('rules', [])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'agents', 'na-agent')
  expect(row).toBeDefined()
  expect(row!.claude.state).toBe('n-a') // keine Plugins -> n-a (ehrlich)
})

// ── plugins-Kategorie -> Codex n-a ───────────────────────────────────────

test('plugins-Kategorie: Codex-Zelle ist immer n-a (Claude-spezifisch)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-plugin-entry.json', '{"name":"plugin"}\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('plugins', [mkEntry('p-foo', 'plugin-entry', claudePath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'plugins', 'plugin-entry')
  expect(row).toBeDefined()
  expect(row!.codex.state).toBe('n-a')
})

// ── Keine Secret-Werte im Output ─────────────────────────────────────────

test('kein Secret-Wert in Output: nur Namen/Status/Pfade', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-sec.md', 'KEIN_WERT\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-rules', [mkEntry('sr-sec', 'sec-rule', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  // Nur Namen/Status/Pfade — keine Secret-Sentinels im Output.
  const json = JSON.stringify(rows)
  expect(json).not.toMatch(/sk-[a-zA-Z0-9]/)
  expect(json).not.toMatch(/ANTHROPIC_API_KEY=/)
  expect(json).not.toMatch(/password\s*[:=]\s*[^\s,}\]"]+/)
})

// ── _memory-Eintraege gefiltert ───────────────────────────────────────────

test('_memory-Eintraege erscheinen NICHT in der Coverage-Matrix', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'mem-shared.md', 'MEM\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [{
      ...mkEntry('sa-mem', 'mem', sharedPath),
      path: sharedPath.replace('mem-shared.md', '_memory/mem-shared.md'),
    }])]),
  }
  const rows = buildCoverage(data)
  const memRow = rows.find((r) => r.name.toLowerCase() === 'mem' && r.cat === 'agents')
  expect(memRow).toBeUndefined()
})

// ── MIGRATION aus dedupe-cat.spec.ts (WP-03-Narrowing) ───────────────────
// 7 Faelle, die nach isComparable cross-family=false als Duplicates 0 liefern.
// Coverage liefert die Rows — HR7: keine Assertion ersatzlos gestrichen.

test('[MIGRATION] rules (claude) <-> shared-rules: Coverage-Row vorhanden (Achse rules)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-claude-rule.md', 'IDENTISCH\n')
  const sharedPath = seedFile(sb, 'mig-shared-rule.md', 'IDENTISCH\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('rules', [mkEntry('mig-rule-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-rules', [mkEntry('mig-sr-foo', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'rules', 'foo')
  expect(row).toBeDefined()
  // Identischer Inhalt -> beide Seiten 'identisch'.
  expect(row!.shared.state).toBe('identisch')
  expect(row!.claude.state).toBe('identisch')
})

test('[MIGRATION] instructions <-> shared-instructions: Coverage-Row vorhanden, Inhalt abweichend', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-CLAUDE.md', 'CLAUDE-INHALT\n')
  const sharedPath = seedFile(sb, 'mig-shared-CLAUDE.md', 'SHARED-INHALT-ANDERS\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('instructions', [mkEntry('mig-instr-claude', 'CLAUDE.md', claudePath)])]),
    shared: mkFamily([mkCat('shared-instructions', [mkEntry('mig-instr-shared', 'CLAUDE.md', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'instructions', 'CLAUDE.md')
  expect(row).toBeDefined()
  // Inhalt unterscheidet sich -> abweichend (NICHT identisch).
  expect(row!.claude.state).toBe('abweichend')
})

test('[MIGRATION] agents (claude) <-> shared-agents: Coverage-Row vorhanden (Achse agents)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-claude-agent.md', 'GLEICH\n')
  const sharedPath = seedFile(sb, 'mig-shared-agent.md', 'GLEICH\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('agents', [mkEntry('mig-agent-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-agents', [mkEntry('mig-sa-foo', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'agents', 'foo')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('identisch')
  expect(row!.claude.state).toBe('identisch')
})

test('[MIGRATION] hooks (claude) <-> shared-hooks: Coverage-Row vorhanden (Achse hooks)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-claude-hook.cjs', 'H\n')
  const sharedPath = seedFile(sb, 'mig-shared-hook.cjs', 'H\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('hooks', [mkEntry('mig-hook-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-hooks', [mkEntry('mig-sh-foo', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'hooks', 'foo')
  expect(row).toBeDefined()
  expect(['identisch', 'vorhanden']).toContain(row!.shared.state)
})

test('[MIGRATION] teams (claude) <-> shared-teams: Coverage-Row vorhanden (Achse teams)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-claude-team.json', 'T\n')
  const sharedPath = seedFile(sb, 'mig-shared-team.json', 'T\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('teams', [mkEntry('mig-team-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-teams', [mkEntry('mig-st-foo', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'teams', 'foo')
  expect(row).toBeDefined()
  expect(['identisch', 'vorhanden']).toContain(row!.shared.state)
})

test('[MIGRATION] plugins (claude) <-> shared-plugins: Coverage-Row vorhanden (Achse plugins)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'mig-claude-plugin.json', 'P\n')
  const sharedPath = seedFile(sb, 'mig-shared-plugin.json', 'P\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('plugins', [mkEntry('mig-plugin-foo', 'foo', claudePath)])]),
    shared: mkFamily([mkCat('shared-plugins', [mkEntry('mig-sp-foo', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'plugins', 'foo')
  expect(row).toBeDefined()
  // plugins-Kategorie: Codex ist n-a.
  expect(row!.codex.state).toBe('n-a')
  // Claude hat echte Datei -> identisch oder abweichend (nicht fehlt).
  expect(row!.claude.state).not.toBe('fehlt')
})

test('[MIGRATION] codex-agents (codex) <-> shared-agents: Coverage-Row vorhanden (Codex-Praefix-Strip)', () => {
  const sb: Sandbox = makeSandbox()
  const codexPath = seedFile(sb, 'mig-codex-agent.md', 'C\n')
  const sharedPath = seedFile(sb, 'mig-shared-codex-agent.md', 'C\n')
  const data: Record<string, LlmConfig> = {
    codex: mkFamily([mkCat('codex-agents', [mkEntry('mig-ca-foo', 'foo', codexPath)])]),
    shared: mkFamily([mkCat('shared-agents', [mkEntry('mig-sa-foo2', 'foo', sharedPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'agents', 'foo')
  expect(row).toBeDefined()
  // normalizeCat strippt 'codex-' und 'shared-' -> beide auf Achse 'agents'.
  expect(row!.shared.state).toBe('identisch')
  expect(row!.codex.state).toBe('identisch')
})
