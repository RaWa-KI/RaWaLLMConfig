// coverage-ack-key.spec.ts — Key-Konsistenz (E-WP3 L1): der Renderer-Selector
// muss denselben Ack-Schluessel bauen wie die Scan-Seite (applyCoverageAcks in
// scan-index.ts). Gepinnt: familyId = Record-Key aus AppData.data, categoryId =
// category.id, key = coverageEntryKey(...) inkl. userglobal->source-Mapping und
// Prefix-Strip. Filter (isCoverageInfoEntry) bleibt unveraendert.
import { expect, test } from '@playwright/test'
import type { AppData, ConfigEntry, LlmConfig } from '../../shared/contract'
import { coverageEntryKey } from '../../shared/contract-coverage'
import { selectCoverageEntries } from '../../src/renderer/sections/overview/overview-selectors'

test('Selector-Zeilen tragen denselben Ack-Key wie die Scan-Seite (inkl. userglobal-Mapping)', () => {
  const claudeEntry = entry({ id: 'mcp-global-server' })
  const userglobalEntry = entry({ id: 'userglobal-claude-rules-x' })
  const activeEntry = entry({ id: 'plain-active', status: 'active' })
  const config = appData({
    claude: family('plugins', [claudeEntry]),
    userglobal: family('userglobal-rules', [userglobalEntry]),
    codex: family('codex-plugins', [activeEntry])
  })

  const rows = selectCoverageEntries(config)
  expect(rows).toHaveLength(2)

  const claudeRow = rows.find((row) => row.entry === claudeEntry)
  expect(claudeRow?.familyId).toBe('claude')
  expect(claudeRow?.categoryId).toBe('plugins')
  expect(claudeRow?.key).toBe(coverageEntryKey('claude', 'plugins', 'mcp-global-server'))

  const globalRow = rows.find((row) => row.entry === userglobalEntry)
  expect(globalRow?.familyId).toBe('userglobal')
  expect(globalRow?.categoryId).toBe('userglobal-rules')
  expect(globalRow?.key).toBe(coverageEntryKey('userglobal', 'userglobal-rules', 'userglobal-claude-rules-x'))
  expect(globalRow?.key).toBe('source:userglobal-rules:rules-x')
})

function entry(partial: Partial<ConfigEntry> & { id: string }): ConfigEntry {
  return {
    name: partial.id,
    status: 'conflict',
    scope: 'global',
    path: '',
    desc: '',
    updated: '',
    loadMode: 'bei-bedarf',
    ...partial
  }
}

function family(categoryId: string, entries: ConfigEntry[]): LlmConfig {
  return { categories: [{ id: categoryId, label: '', icon: '', path: '', blurb: '', entries }], duplicates: [] }
}

function appData(data: Record<string, LlmConfig>): AppData {
  return { snapshot: { frozen: false, date: 'today', label: 'test' }, machines: [], llms: [], data }
}
