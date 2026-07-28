import { test, expect } from '@playwright/test'
import type { AppData, Watcher } from '../../shared/contract'
import { deMessages, enMessages, MESSAGE_PARAM_NAMES, msg } from '../../shared/messages'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import {
  buildGuidedFlows,
  type GuidedFlow,
  type GuidedFlowId
} from '../../src/renderer/sections/overview/guided-flows-model'

test('guided flows describe four routed orchestration steps', () => {
  const flowIds = ['firstStart', 'checkProblem', 'prepareChange', 'activateModule'] as const
  for (const id of flowIds) {
    expect(deMessages[`guidedFlows.${id}.body`]).toMatch(/Flow/)
    expect(deMessages[`guidedFlows.${id}.target`].length).toBeGreaterThan(4)
    expect(enMessages[`guidedFlows.${id}.body`].length).toBeGreaterThan(20)
    expect(enMessages[`guidedFlows.${id}.target`].length).toBeGreaterThan(4)

    for (const step of ['one', 'two', 'three', 'four'] as const) {
      expect(deMessages[`guidedFlows.${id}.step.${step}`].length).toBeGreaterThan(12)
      expect(enMessages[`guidedFlows.${id}.step.${step}`].length).toBeGreaterThan(12)
    }
  }
  expect(msg('guidedFlows.backToDetails', { target: 'Module' })).toBe('Zu Module')
  expect(msg('guidedFlows.symptomTitle')).toBe('Aktuelle Symptome')
})

// WP-5: Jeder Flow traegt jetzt eine echte Navigationsaktion (Sektion +
// Fokus-ID + Ein-Satz-Grund) statt einer pauschalen Sektion.
test('guided flow reasons are registered with typed params in both catalogs', () => {
  expect(MESSAGE_PARAM_NAMES['guidedFlows.firstStart.reason']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.checkProblem.reason']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.checkProblem.reason.card']).toEqual(['target'])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.prepareChange.reason']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.activateModule.reason']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.symptom.reason']).toEqual(['target'])
  expect(msg('guidedFlows.activateModule.reason')).toContain('Modul aktivieren')
  expect(msg('guidedFlows.symptom.reason', { target: 'cache (Plugins)' })).toContain('cache (Plugins)')
})

test('every guided flow carries a navigation action with a one sentence reason', () => {
  const flows = buildGuidedFlows([])
  expect(flows.map((flow) => flow.id)).toEqual(['firstStart', 'checkProblem', 'prepareChange', 'activateModule'])
  for (const flow of flows) {
    expect(flow.navigation.reason.length).toBeGreaterThan(20)
    expect(flow.navigation.label).toContain(flow.targetLabel)
    expect(flow.navigation.route).toBe(flow.target)
    expect(flow.navigation.targetDescription).toBeTruthy()
  }
})

test('activate module preselects the modules tab instead of the wrong tab', () => {
  expect(flowById(buildGuidedFlows([]), 'activateModule').navigation).toMatchObject({
    route: 'settings',
    focusId: 'settings-tab-modules'
  })
})

test('check problem targets the top diagnosis card instead of a fixed section', () => {
  const cards = buildDiagnosisCards({
    config: pluginCacheConfig(), system: null, watcher: watcherFixture(), errors: []
  })
  // Oberste passende Karte = erste sortierte Karte mit konkretem Anker; Karten
  // ohne Anker koennen nur die Sektion oeffnen und fuehren nicht zum Eintrag.
  const top = cards.find((card) => card.diagnosisAction.focusId !== undefined)
  expect(top).toBeTruthy()
  if (!top) throw new Error('Fixture ohne Anker')
  const flow = flowById(buildGuidedFlows(cards), 'checkProblem')
  expect(flow.navigation.route).toBe(top.diagnosisAction.route)
  expect(flow.navigation.focusId).toBe(top.diagnosisAction.focusId)
  expect(flow.navigation.targetDescription).toBe(top.title)
  expect(flow.navigation.reason).toContain(top.title)
})

test('check problem keeps the section fallback when no finding is open', () => {
  const flow = flowById(buildGuidedFlows([]), 'checkProblem')
  expect(flow.navigation.route).toBe('updates')
  expect(flow.navigation.focusId).toBeUndefined()
})

test('symptom buttons keep the focus id of their diagnosis card', () => {
  const cards = buildDiagnosisCards({ config: null, system: null, watcher: watcherFixture(), errors: [] })
  const flow = flowById(buildGuidedFlows(cards), 'checkProblem')
  const symptom = flow.symptoms.find((item) => item.id === 'watcher-Codex Changelog')
  expect(symptom?.navigation).toMatchObject({
    route: 'updates',
    focusId: 'watcher-source-Codex Changelog',
    targetDescription: 'Codex Changelog'
  })
  expect(symptom?.navigation.reason).toContain('Codex Changelog')
})

function flowById(flows: GuidedFlow[], id: GuidedFlowId): GuidedFlow {
  const flow = flows.find((item) => item.id === id)
  if (!flow) throw new Error(`Flow fehlt: ${id}`)
  return flow
}

function watcherFixture(): Watcher {
  return {
    daemon: {
      status: 'running',
      lastResult: 'ok',
      schedule: 'daily',
      tokens: '0',
      sources: 1,
      updated: '2026-07-07',
      note: ''
    },
    tiers: [],
    sources: [{
      name: 'Codex Changelog',
      kind: 'docs',
      current: '0.1.0',
      latest: '0.2.0',
      tier: 1,
      state: 'update',
      note: 'Neue Version gefunden'
    }],
    changelogs: []
  }
}

function pluginCacheConfig(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [{ id: 'codex', glyph: '', name: 'Codex', sub: '', color: '', path: '' }],
    data: {
      codex: {
        categories: [{
          id: 'codex-plugins',
          label: 'Plugins',
          icon: 'plug',
          path: '',
          blurb: '',
          entries: [{
            id: 'codex-plugins-cache',
            name: 'cache',
            status: 'conflict',
            scope: 'global',
            path: 'cache',
            desc: 'Plugin-Cache',
            updated: 'today',
            conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register'
          }]
        }],
        duplicates: []
      }
    }
  }
}
