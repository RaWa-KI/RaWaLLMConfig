import { test, expect } from '@playwright/test'
import type { AppData, ConfigEntry, Scope } from '../../shared/contract'
import { buildSameFileGroups } from '../../src/renderer/sections/compare/same-file-candidates'

test('AGENTS.md across personal shared and project becomes ready with everyday origins', () => {
  const app = appData([
    entry('u-agents', 'AGENTS.md', 'global', 'C:/Users/u/.codex/AGENTS.md'),
    entry('s-agents', 'AGENTS.md', 'shared', 'C:/Users/u/Desktop/Projekte/.shared/AGENTS.md'),
    entry('p-agents', 'AGENTS.md', 'project', 'C:/Users/u/Desktop/Projekte/RaWaLLMConfig/AGENTS.md'),
  ])

  const group = buildSameFileGroups(app).find((item) => item.basename === 'AGENTS.md')

  expect(group?.status).toBe('ready')
  expect(group?.candidates.length).toBeGreaterThanOrEqual(2)
  expect(group?.candidates.map((item) => item.origin)).toEqual(['Persönlich', 'Geteilt', 'Workspace'])
})

test('duplicate same basename at same place becomes ambiguous', () => {
  const groups = buildSameFileGroups([
    category([
      entry('a', 'AGENTS.md', 'project', 'C:/ws/a/AGENTS.md'),
      entry('b', 'AGENTS.md', 'project', 'C:/ws/b/AGENTS.md'),
    ])
  ])

  const group = groups.find((item) => item.basename === 'AGENTS.md')

  expect(group?.status).toBe('ambiguous')
})

test('only one common file found becomes partial and not ready', () => {
  const groups = buildSameFileGroups([
    category([entry('settings', 'settings.json', 'local', 'C:/ws/.rawallmconfig/settings.json')])
  ])

  const group = groups.find((item) => item.basename === 'settings.json')

  expect(group?.status).toBe('partial')
  expect(group?.candidates).toHaveLength(1)
})

function appData(entries: ConfigEntry[]): AppData {
  return {
    snapshot: { frozen: false, date: '2026-07-07', label: 'Test' },
    machines: [],
    llms: [],
    data: { test: { categories: [category(entries)], duplicates: [] } },
  }
}

function category(entries: ConfigEntry[]) {
  return { id: 'test', label: 'Test', icon: 'note', path: '', blurb: '', entries }
}

function entry(id: string, name: string, scope: Scope, path: string): ConfigEntry {
  return { id, name, scope, path, status: 'active', desc: '', updated: '2026-07-07' }
}
