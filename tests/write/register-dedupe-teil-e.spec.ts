// register-dedupe-teil-e.spec.ts — E-WP3 L2 (Masterplan Teil E): audit-Befunde
// erscheinen EINMALIG unter „Abdeckung & Register". Die Dreifach-Darstellung
// (Warn-Zaehler, Diagnose-Karte, Pseudo-Familien-Tab) ist aufgeloest; die Daten
// (data.audit) bleiben fuer den Register-Selector erhalten.
import { expect, test } from '@playwright/test'
import type { AppData, ConfigEntry, LlmConfig } from '../../shared/contract'
import { coverageEntryKey } from '../../shared/contract-coverage'
import { isCoverageInfoEntry } from '../../shared/entry-attention'
import { buildLlms } from '../../src/main/scan/scan-index'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'
import { selectCoverageEntries } from '../../src/renderer/sections/overview/overview-selectors'

const auditEntry1 = entry({ id: 'audit-refs-1', conflictReason: 'Toter Wikilink' })
const auditEntry2 = entry({ id: 'audit-hr27-1', conflictReason: 'Datei ueber Limit' })
const controlEntry = entry({ id: 'mcp-global-server' })

function configFixture(): AppData {
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: {
      audit: family('audit-references', [auditEntry1, auditEntry2]),
      claude: family('plugins', [controlEntry])
    }
  }
}

test('register selector shows audit rows once with the scan-side ack key', () => {
  const rows = selectCoverageEntries(configFixture())
  expect(rows.map((row) => row.key)).toEqual([
    coverageEntryKey('audit', 'audit-references', 'audit-refs-1'),
    coverageEntryKey('audit', 'audit-references', 'audit-hr27-1')
  ])
  expect(rows.every((row) => row.familyId === 'audit')).toBe(true)
})

test('overview warning count skips audit but keeps the control conflict', () => {
  const model = buildOverviewModel({ config: configFixture(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(model.warningCount).toBe(1)
})

test('diagnosis cards skip audit entries but keep the control conflict card', () => {
  const cards = buildDiagnosisCards({ config: configFixture(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(cards.some((card) => card.id.startsWith('entry-audit-'))).toBe(false)
  expect(cards.some((card) => card.id === 'entry-claude-mcp-global-server')).toBe(true)
})

test('buildLlms exposes no audit pseudo tab while data stays in AppData.data', () => {
  const data = configFixture().data
  expect(data.audit).toBeDefined()
  const llms = buildLlms(data)
  expect(llms.some((llm) => llm.id === 'audit')).toBe(false)
  expect(llms.some((llm) => llm.id === 'claude')).toBe(true)
})

test('isCoverageInfoEntry treats audit as coverage info only with the family id', () => {
  expect(isCoverageInfoEntry(auditEntry1, 'audit')).toBe(true)
  expect(isCoverageInfoEntry(auditEntry1)).toBe(false)
  expect(isCoverageInfoEntry(controlEntry, 'claude')).toBe(false)
})

function entry(partial: Partial<ConfigEntry> & { id: string }): ConfigEntry {
  // audit-Shape wie scan-audit-categories.ts: status conflict, KEIN loadMode.
  return {
    name: partial.id,
    status: 'conflict',
    scope: 'project',
    path: '',
    desc: '',
    updated: '',
    ...partial
  }
}

function family(categoryId: string, entries: ConfigEntry[]): LlmConfig {
  return { categories: [{ id: categoryId, label: '', icon: '', path: '', blurb: '', entries }], duplicates: [] }
}

function readySystem() {
  return { updated: '', areas: [{ id: 'runtime', label: 'Runtime', icon: '', blurb: '', entries: [{ name: 'Node', status: 'active' as const, desc: '' }] }] }
}

function readyWatcher() {
  return { daemon: { status: 'running', lastResult: '', schedule: '', tokens: '', sources: 1, updated: '', note: '' }, tiers: [], sources: [{ name: 'Codex', kind: '', current: '', latest: '', tier: 1 as const, state: 'current' as const }], changelogs: [] }
}
