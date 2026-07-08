import { test, expect } from '@playwright/test'
import type { AppData, System, Watcher } from '../../shared/contract'
import { resolveConfigFocus } from '../../src/renderer/sections/config/config-focus'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'

test('diagnosis cards expose concrete navigation action for watcher source', () => {
  const cards = buildDiagnosisCards({ config: null, system: null, watcher: watcherFixture(), errors: [] })
  const sourceCard = cards.find((card) => card.id === 'watcher-Codex Changelog')
  expect(sourceCard?.diagnosisAction).toMatchObject({
    route: 'updates',
    focusId: 'watcher-source-Codex Changelog',
    reason: expect.any(String)
  })
  expect(sourceCard?.diagnosisAction.label).toContain('Codex Changelog')
})

test('overview model exposes object-based fallback next action', () => {
  const model = buildOverviewModel({ config: null, system: null, watcher: null, errors: [] })
  expect(model.nextAction.route).toBe('settings')
  expect(model.nextAction.label).toBeTruthy()
  expect(model.nextAction.reason).toBeTruthy()
  expect(model.nextAction.targetDescription).toBeTruthy()
})

test('overview status names open topics instead of showing competing counters', () => {
  const model = buildOverviewModel({
    config: pluginCacheConfig(),
    system: readySystem(),
    watcher: watcherFixture(),
    errors: []
  })
  expect(model.statusSummary).toBe('Teilweise bereit: 1 von 3 Grundbereichen sind bereit.')
  expect(model.warningTopics).toEqual(['Einstellungen und lokale Quellen', 'Wartung und Updates'])
  expect(model.metrics.map((metric) => metric.text)).toEqual([
    'Teilweise bereit: 1 von 3 Grundbereichen sind bereit.',
    'Offene Themen: Einstellungen und lokale Quellen, Wartung und Updates.',
    'Einrichtung vollständig: alle Grundbereiche sind verbunden.'
  ])
})

test('config diagnosis opens the exact family category and entry', () => {
  const config = pluginCacheConfig()
  const cards = buildDiagnosisCards({ config, system: null, watcher: null, errors: [] })
  const card = cards.find((item) => item.id === 'entry-codex-codex-plugins-cache')
  expect(card?.where).toBe('Ändern > Codex > Plugins')
  expect(card?.diagnosisAction.label).toContain('cache (Plugins)')
  expect(card?.changeHint).toContain('Nur im Plugin-Ordner')
  expect(resolveConfigFocus(config, card?.diagnosisAction.focusId)).toEqual({
    llm: 'codex',
    catId: 'codex-plugins',
    entryId: 'codex-plugins-cache'
  })
})

test('ollama system hint routes to settings sources instead of watcher', () => {
  const cards = buildDiagnosisCards({ config: null, system: ollamaSystemFixture(), watcher: null, errors: [] })
  const card = cards.find((item) => item.id === 'system-env-OLLAMA_*')
  const ollamaCards = cards.filter((item) => item.diagnosisAction.focusId === 'settings-tab-sources')
  expect(ollamaCards).toHaveLength(1)
  expect(card?.where).toBe('Einstellungen > Ordner')
  expect(card?.diagnosisAction).toMatchObject({
    route: 'settings',
    focusId: 'settings-tab-sources'
  })
  expect(card?.title).toContain('Ollama wurde erkannt')
  expect(card?.meaning).toContain('Ollama ist ein lokaler Dienst')
  expect(card?.how).toContain('~/.ollama')
  expect(card?.changeHint).toContain('~/.ollama')
  expect(card?.details).toEqual(expect.arrayContaining([
    expect.stringContaining('OLLAMA_*'),
    expect.stringContaining('~/.ollama')
  ]))
})

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

function ollamaSystemFixture(): System {
  return {
    updated: '2026-07-08',
    areas: [{
      id: 'env',
      label: 'Env-Variablen',
      icon: 'key',
      blurb: 'Nur Namen.',
      entries: [{
        id: 'ollama',
        name: 'OLLAMA_*',
        status: 'stale',
        desc: 'OLLAMA_MODELS u.a. — wirkungslos (Ollama entfernt).'
      }, {
        id: 'ollama-dir',
        name: '~/.ollama',
        status: 'stale',
        desc: 'Ollama-Ordner gefunden, aber noch nicht als Quelle verbunden.'
      }]
    }]
  }
}

function readySystem(): System {
  return {
    updated: '2026-07-08',
    areas: [{
      id: 'runtime',
      label: 'Runtime',
      icon: 'cpu',
      blurb: '',
      entries: [{ id: 'node', name: 'Node', status: 'active', desc: 'ok' }]
    }]
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
