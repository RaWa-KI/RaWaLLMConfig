// Coverage-Semantik fuer Codex-Agent-TOML gegen Shared-Agent-Markdown.
// Sandbox-only: keine echten ~/.codex- oder Shared-Pfade werden beschrieben.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildCoverage } from '../../src/main/services/coverage'
import { makeSandbox } from './fixtures'
import type { Category, ConfigEntry, CoverageRow, LlmConfig } from '../../shared/contract'

function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-06-10' }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

function findRow(rows: CoverageRow[], cat: string, name: string): CoverageRow | undefined {
  const n = name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '')
  return rows.find((r) => r.cat === cat && r.name.toLowerCase().replace(/\.(md|toml|ya?ml|json|rules)$/i, '') === n)
}

test('Codex-Agent-TOML wird semantisch gegen Shared-Agent-Markdown verglichen', () => {
  const sb = makeSandbox()
  const sharedDir = join(sb.configDir, '.shared', '.claude', 'agents')
  const codexDir = join(sb.configDir, '.codex', 'agents')
  mkdirSync(sharedDir, { recursive: true })
  mkdirSync(codexDir, { recursive: true })
  const sharedPath = join(sharedDir, 'semantic-agent.md')
  const codexPath = join(codexDir, 'semantic-agent.toml')

  writeFileSync(sharedPath, [
    '---',
    'name: semantic-agent',
    'description: "Shared Agent"',
    'effort: max',
    '---',
    '',
    '# Semantic Agent',
    '',
    '## Aufgabe',
    '',
    'Du pruefst Adapter semantisch.',
    '',
    '```text',
    'FORMAT-HINWEIS',
    '```',
    '',
  ].join('\n'), 'utf8')
  writeFileSync(codexPath, [
    'name = "semantic-agent"',
    'description = "Shared Agent"',
    'model_reasoning_effort = "xhigh"',
    'developer_instructions = \'\'\'',
    '# Semantic Agent',
    '',
    'Du pruefst Adapter semantisch.',
    '',
    'FORMAT-HINWEIS',
    '\'\'\'',
    '',
  ].join('\n'), 'utf8')

  const data: Record<string, LlmConfig> = {
    shared: mkFamily([mkCat('shared-agents', [mkEntry('sa-sem', 'semantic-agent', sharedPath)])]),
    codex: mkFamily([mkCat('codex-agents', [mkEntry('ca-sem', 'semantic-agent', codexPath)])]),
  }
  const row = findRow(buildCoverage(data), 'agents', 'semantic-agent')
  expect(row).toBeDefined()
  expect(row!.codex.state).toBe('identisch')
})
