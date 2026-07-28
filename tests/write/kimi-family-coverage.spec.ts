// kimi-family-coverage.spec.ts — WP-8 (B9): Kimi als vollstaendige Familie im
// Quervergleich. Kimi (~/.kimi-code) ist ein gleichwertiger nativer Loader
// (HR16) und muss in der Spiegelungs-Matrix (Coverage) UND in der Drift-
// Erkennung (userglobal-kimi-*) auftauchen. Disambiguierung: DriftRootKind
// 'agents' bleibt der ~/.agents-Loader ('Kimi (.agents)'), 'kimi' steht fuer
// ~/.kimi-code. ALLE Pfade in temp-Sandbox (NIE reale Config), Inhalte Dummy.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { buildCoverage } from '../../src/main/services/coverage'
import { findDriftRelations } from '../../src/main/services/drift-relation'
import { createDriftRelationStore } from '../../src/main/services/drift-relation-store'
import { driftRelationKey } from '../../shared/contract-drift'
import { DRIFT_ROOTKIND } from '../../shared/drift-labels'
import { normalizeCat } from '../../shared/cat-key'
import { coverageImpact } from '../../src/renderer/sections/coverage/coverage-semantics'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'
import type { ConfigEntry, Category, LlmConfig, CoverageRow } from '../../shared/contract'

function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-07-27' }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

function findRow(rows: CoverageRow[], cat: string, name: string): CoverageRow | undefined {
  return rows.find((r) => r.cat === cat && r.name.toLowerCase() === name.toLowerCase())
}

function mkStore(sb: Sandbox) {
  return createDriftRelationStore({
    storePath: `${sb.configDir}/drift-decisions.json`,
    archiveRoot: sb.archiveRoot,
    auditPath: sb.auditPath,
  })
}

// ── Coverage: Kimi-Zelle in der Spiegelungs-Matrix ───────────────────────

test('Coverage: Shared<->Kimi mit gleichem Inhalt -> Kimi-Zelle identisch', () => {
  const sb: Sandbox = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-rules-foo.md', 'IDENTISCH\n')
  const kimiPath = seedFile(sb, 'kimi-rules-foo.md', 'IDENTISCH\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-rules', [mkEntry('sr-foo', 'foo', sharedPath)])]),
    kimi: mkFamily([mkCat('kimi-rules', [mkEntry('kr-foo', 'foo', kimiPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'rules', 'foo')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('identisch')
  expect(row!.kimi?.state).toBe('identisch')
})

test('Coverage: Kimi-only-Config erscheint mit shared=fehlt, kimi befuellt', () => {
  const sb: Sandbox = makeSandbox()
  const kimiPath = seedFile(sb, 'kimi-only-hook.cjs', 'H\n')
  const data: Record<string, LlmConfig> = {
    kimi: mkFamily([mkCat('kimi-hooks', [mkEntry('kh-only', 'only-hook', kimiPath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'hooks', 'only-hook')
  expect(row).toBeDefined()
  expect(row!.shared.state).toBe('fehlt')
  expect(row!.kimi?.state).not.toBe('fehlt')
})

test('Coverage: plugins-Kategorie -> Kimi-Zelle n-a (Claude-spezifisch)', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'claude-plugin-entry.json', '{"name":"plugin"}\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('plugins', [mkEntry('p-foo', 'plugin-entry', claudePath)])]),
  }
  const rows = buildCoverage(data)
  const row = findRow(rows, 'plugins', 'plugin-entry')
  expect(row).toBeDefined()
  expect(row!.kimi?.state).toBe('n-a')
})

// ── Kategorie-Achse: kimi-Praefixe werden normalisiert ───────────────────

test('normalizeCat strippt kimi- und userglobal-kimi-Praefixe', () => {
  expect(normalizeCat('kimi-rules')).toBe('rules')
  expect(normalizeCat('userglobal-kimi-rules')).toBe('rules')
  // Bestand unveraendert:
  expect(normalizeCat('shared-rules')).toBe('rules')
  expect(normalizeCat('codex-rules')).toBe('rules')
  expect(normalizeCat('userglobal-agents-skills')).toBe('skills')
})

// ── Drift: userglobal-kimi bildet Relationen ─────────────────────────────

test('Drift: userglobal-kimi + userglobal-claude gleichen Namens -> 1 Relation mit rootKind kimi', () => {
  const sb: Sandbox = makeSandbox()
  const claudePath = seedFile(sb, 'c-foo.md', 'GLEICH\n')
  const kimiPath = seedFile(sb, 'k-foo.md', 'GLEICH\n')
  const data: Record<string, LlmConfig> = {
    userglobal: mkFamily([
      mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', claudePath)]),
      mkCat('userglobal-kimi-skills', [mkEntry('k-foo', 'foo', kimiPath)]),
    ]),
  }
  findDriftRelations(data, mkStore(sb))
  const relations = data.userglobal.driftRelations ?? []
  expect(relations).toHaveLength(1)
  expect(relations[0].status).toBe('same')
  expect(relations[0].members.map((m) => m.rootKind).sort()).toEqual(['claude', 'kimi'])
})

test('Drift: agents (~/.agents) und kimi (~/.kimi-code) bleiben disambigue Roots', () => {
  const sb: Sandbox = makeSandbox()
  const agentsPath = seedFile(sb, 'a-foo.md', 'DREI\n')
  const kimiPath = seedFile(sb, 'k-foo.md', 'DREI\n')
  const data: Record<string, LlmConfig> = {
    userglobal: mkFamily([
      mkCat('userglobal-agents-skills', [mkEntry('a-foo', 'foo', agentsPath)]),
      mkCat('userglobal-kimi-skills', [mkEntry('k-foo', 'foo', kimiPath)]),
    ]),
  }
  findDriftRelations(data, mkStore(sb))
  const relations = data.userglobal.driftRelations ?? []
  expect(relations).toHaveLength(1)
  expect(relations[0].members.map((m) => m.rootKind).sort()).toEqual(['agents', 'kimi'])
})

// ── Stabilitaet + Labels ─────────────────────────────────────────────────

test('driftRelationKey: bestehende Keys bleiben stabil, kimi wird sortiert eingefuegt', () => {
  expect(driftRelationKey('userglobal-claude-skills', 'foo', ['claude', 'codex']))
    .toBe('skills|foo|claude+codex')
  expect(driftRelationKey('userglobal-claude-skills', 'foo', ['kimi', 'claude']))
    .toBe('skills|foo|claude+kimi')
})

test('DRIFT_ROOTKIND: kimi hat eigenes Label, agents-Label unveraendert', () => {
  expect(DRIFT_ROOTKIND.kimi).toBe('Kimi (.kimi-code)')
  expect(DRIFT_ROOTKIND.agents).toBe('Kimi (.agents)')
  expect(DRIFT_ROOTKIND.claude).toBe('Claude')
  expect(DRIFT_ROOTKIND.codex).toBe('Codex')
})

// ── Semantik-Texte: laienverstaendlich fuer Kimi ─────────────────────────

test('coverageImpact: Kimi-Familie liefert laienverstaendlichen Kimi-Text', () => {
  const impact = coverageImpact('rules', 'fehlt', 'kimi')
  expect(impact.text).toContain('Kimi')
  expect(impact.text).not.toContain('Codex')
  // Default bleibt Codex (Bestand unveraendert).
  expect(coverageImpact('rules', 'fehlt').text).toContain('Codex')
})

// ── Source-Pins: Matrix-Header/Zelle/Grid zeigen Kimi ────────────────────

test('Source-Pin: CoverageVirtualTable + CoverageRowHead + CSS-Grid enthalten Kimi-Spalte', () => {
  const table = readFileSync(join(process.cwd(), 'src/renderer/sections/coverage/CoverageVirtualTable.tsx'), 'utf8')
  expect(table).toContain('>Kimi<')
  const head = readFileSync(join(process.cwd(), 'src/renderer/sections/coverage/CoverageRowHead.tsx'), 'utf8')
  expect(head).toContain('tool="Kimi"')
  const css = readFileSync(join(process.cwd(), 'src/renderer/sections/coverage/CoverageView.css'), 'utf8')
  // Vier Werkzeug-Spalten (Shared/Claude/Codex/Kimi) + Name + Aktionen.
  expect(css).toContain('1fr 90px 90px 90px 90px 32px')
})
