import { test, expect } from '@playwright/test'
import { deMessages, enMessages, MESSAGE_KEYS } from '../../shared/messages'
import type { MessageKey } from '../../shared/messages'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import type { AppData, System, Watcher } from '../../shared/contract'

const nuxNamespaces = [
  'overview',
  'tasks',
  'simpleMode',
  'expertDetails',
  'diagnostics',
  'guidedFlows'
] as const

const glossaryPairs = [
  ['expertDetails.glossary.provider.primary', 'expertDetails.glossary.provider.expert'],
  ['expertDetails.glossary.mcp.primary', 'expertDetails.glossary.mcp.expert'],
  ['expertDetails.glossary.hook.primary', 'expertDetails.glossary.hook.expert'],
  ['expertDetails.glossary.registry.primary', 'expertDetails.glossary.registry.expert'],
  ['expertDetails.glossary.shared.primary', 'expertDetails.glossary.shared.expert'],
  ['expertDetails.glossary.endpoint.primary', 'expertDetails.glossary.endpoint.expert'],
  ['expertDetails.glossary.config.primary', 'expertDetails.glossary.config.expert']
] as const satisfies readonly (readonly [MessageKey, MessageKey])[]

const overviewTaskIds = ['setup', 'check', 'change', 'restore', 'expert'] as const
const diagnosisStatuses = [
  'Nicht eingerichtet',
  'Nicht gefunden',
  'Nicht verfügbar',
  'Pausiert',
  'Fehler gefunden',
  'Nicht nutzbar'
] as const

test('NUX namespaces are ready for UI slices', () => {
  for (const namespace of nuxNamespaces) {
    expect(MESSAGE_KEYS.some((key) => key.startsWith(`${namespace}.`))).toBeTruthy()
  }
})

test('glossary basics keep primary and expert wording paired', () => {
  for (const [primaryKey, expertKey] of glossaryPairs) {
    expect(deMessages[primaryKey]).not.toEqual(deMessages[expertKey])
    expect(enMessages[primaryKey]).not.toEqual(enMessages[expertKey])
  }
  expect(deMessages['expertDetails.glossary.provider.primary']).toBe('KI-Anbieter')
  expect(deMessages['expertDetails.glossary.mcp.expert']).toBe('MCP-Server')
  expect(deMessages['expertDetails.glossary.config.primary']).toBe('Einstellungsdatei')
})

test('overview tasks provide everyday meaning and expert target text', () => {
  for (const id of overviewTaskIds) {
    const termKey = `tasks.${id}.term` as MessageKey
    const meaningKey = `tasks.${id}.meaning` as MessageKey
    const expertTargetKey = `tasks.${id}.expertTarget` as MessageKey
    expect(deMessages[termKey].length).toBeGreaterThan(4)
    expect(deMessages[meaningKey]).toMatch(/Du|dir/)
    expect(deMessages[expertTargetKey].length).toBeGreaterThan(4)
    expect(enMessages[meaningKey].length).toBeGreaterThan(12)
  }
})

test('diagnosis model maps persistent states to distinct user-facing cards', () => {
  const cards = [
    ...buildDiagnosisCards({ config: null, system: readySystem(), watcher: readyWatcher(), errors: [] }),
    ...buildDiagnosisCards({
      config: problemConfig(),
      system: null,
      watcher: pausedWatcher(),
      errors: ['bridge-down']
    })
  ]
  const statuses = cards.map((card) => card.status)
  for (const status of diagnosisStatuses) expect(statuses).toContain(status)
  expect(cards.some((card) => card.id === 'watcher-paused')).toBeTruthy()
  expect(cards.every((card) => card.meaning.length > 12)).toBeTruthy()
  expect(cards.every((card) => card.action.length > 4)).toBeTruthy()
})

function readySystem(): System {
  return { updated: 'today', areas: [{ id: 'runtime', label: 'Runtime', icon: 'gear', blurb: '', entries: [] }] }
}

function readyWatcher(): Watcher {
  return {
    daemon: { status: 'Ready', lastResult: '0', schedule: '-', tokens: '-', sources: 1, updated: 'today', note: '' },
    tiers: [],
    sources: [{ name: 'Codex', kind: 'CLI', current: '1', latest: '1', tier: 1, state: 'current' }],
    changelogs: []
  }
}

function pausedWatcher(): Watcher {
  return {
    ...readyWatcher(),
    daemon: { ...readyWatcher().daemon, status: 'Paused', note: 'manual pause' }
  }
}

function problemConfig(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [{ id: 'codex', glyph: '', name: 'Codex', sub: '', color: '', path: '', scanError: 'scan-failed' }],
    data: {
      codex: {
        categories: [{
          id: 'cat',
          label: 'Cat',
          icon: 'gear',
          path: '',
          blurb: '',
          entries: [
            entry('missing', 'stale'),
            entry('paused', 'archived'),
            entry('conflict', 'conflict')
          ]
        }],
        duplicates: [{ cat: 'cat', name: 'Dup', verdict: 'diff', trunk: side(), mirror: side(), note: '', lines: [] }]
      }
    }
  }
}

function entry(id: string, status: 'stale' | 'archived' | 'conflict') {
  return { id, name: id, status, scope: 'global' as const, path: id, desc: '', updated: 'today' }
}

function side() {
  return { path: 'x', updated: 'today' }
}
