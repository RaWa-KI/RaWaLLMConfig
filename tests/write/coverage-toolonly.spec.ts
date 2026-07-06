// Coverage-Semantik fuer tool-only Rows und Agent-Adapter.
// Sandbox-only: keine echten Shared-/Claude-/Codex-Configpfade.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCoverage } from '../../src/main/services/coverage'
import { makeSandbox, seedFile } from './fixtures'
import type { Category, ConfigEntry, CoverageRow, LlmConfig } from '../../shared/contract'

function mkEntry(id: string, name: string, absPath: string, extra?: Partial<ConfigEntry>): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-06-11', ...extra }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

function findRow(rows: CoverageRow[], cat: string, name: string): CoverageRow {
  const key = name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '')
  const row = rows.find((r) => (
    r.cat === cat &&
    r.name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '') === key
  ))
  expect(row).toBeDefined()
  return row!
}

function writeAgentPair(sb = makeSandbox(), body = 'Du pruefst Adapter semantisch.') {
  const sharedDir = join(sb.configDir, '.shared', '.claude', 'agents')
  const codexDir = join(sb.configDir, '.codex', 'agents')
  mkdirSync(sharedDir, { recursive: true })
  mkdirSync(codexDir, { recursive: true })
  const sharedPath = join(sharedDir, 'semantic-agent.md')
  const codexPath = join(codexDir, 'semantic-agent.toml')
  writeFileSync(sharedPath, sharedAgentMarkdown(), 'utf8')
  writeFileSync(codexPath, codexAgentToml(body), 'utf8')
  return { sharedPath, codexPath }
}

function sharedAgentMarkdown(): string {
  return [
    '---',
    'name: semantic-agent',
    'description: "Shared Agent"',
    'effort: max',
    '---',
    '',
    '# Semantic Agent',
    '',
    'Du pruefst Adapter semantisch.',
    '',
  ].join('\n')
}

function codexAgentToml(body: string): string {
  return [
    'name = "semantic-agent"',
    'description = "Shared Agent"',
    'model_reasoning_effort = "xhigh"',
    "developer_instructions = '''",
    body,
    "'''",
    '',
  ].join('\n')
}

test('Codex-only Agent ist Referenz statt irrefuehrend identisch', () => {
  const sb = makeSandbox()
  const codexPath = seedFile(sb, 'codex-only-agent.toml', 'name = "inbox-sorter"\n')
  const data: Record<string, LlmConfig> = {
    codex: mkFamily([mkCat('codex-agents', [mkEntry('ca-only', 'inbox-sorter.toml', codexPath)])]),
  }
  const row = findRow(buildCoverage(data), 'agents', 'inbox-sorter')
  expect(row.shared.state).toBe('fehlt')
  expect(row.claude.state).toBe('n-a')
  expect(row.codex).toMatchObject({
    state: 'vorhanden',
    path: codexPath,
    note: 'Referenz; kein Gegenstueck verglichen',
  })
})

test('via-plugin ohne konkrete Datei bleibt Plugin-Indiz ohne Dateinachweis', () => {
  const sb = makeSandbox()
  const sharedPath = seedFile(sb, 'shared-agent.md', 'SHARED\n')
  const pluginPath = seedFile(sb, 'installed_plugins.json', '[]\n')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-via', 'via-agent', sharedPath)])]),
    claude: mkFamily([mkCat('plugins', [mkEntry('plug', 'installed_plugins.json', pluginPath, {
      inventory: true,
      fields: { typ: 'installed_plugins.json' },
    })])]),
  }
  const row = findRow(buildCoverage(data), 'agents', 'via-agent')
  expect(row.claude.path).toBeUndefined()
  expect(row.claude.state).toBe('via-plugin')
  expect(row.claude.note).toContain('kein Dateinachweis')
})

test('Shared-md und Codex-toml bleiben bei gleicher Agent-Semantik identisch', () => {
  const { sharedPath, codexPath } = writeAgentPair()
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-sem', 'semantic-agent', sharedPath)])]),
    codex: mkFamily([mkCat('codex-agents', [mkEntry('ca-sem', 'semantic-agent', codexPath)])]),
  }
  const row = findRow(buildCoverage(data), 'agents', 'semantic-agent')
  expect(row.shared.state).toBe('identisch')
  expect(row.codex.state).toBe('identisch')
  expect(row.lines).toBeUndefined()
  expect(row.dir).toBeUndefined()
})

test('Shared-md und Codex-toml bleiben bei abweichender Semantik abweichend mit Diffdaten', () => {
  const { sharedPath, codexPath } = writeAgentPair(makeSandbox(), 'Andere Aufgabe.')
  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-diff', 'semantic-agent', sharedPath)])]),
    codex: mkFamily([mkCat('codex-agents', [mkEntry('ca-diff', 'semantic-agent', codexPath)])]),
  }
  const row = findRow(buildCoverage(data), 'agents', 'semantic-agent')
  expect(row.codex.state).toBe('abweichend')
  expect(row.lines?.length ?? 0).toBeGreaterThan(0)
})
