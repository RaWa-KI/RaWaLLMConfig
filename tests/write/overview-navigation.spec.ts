import { test, expect } from '@playwright/test'
import type { AppData, System, Watcher } from '../../shared/contract'
import { resolveConfigFocus } from '../../src/renderer/sections/config/config-focus'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'
import {
  OVERVIEW_FOCUS_TTL_MS,
  readOverviewFocus,
  rememberOverviewFocus
} from '../../src/renderer/sections/overview/overview-navigation'

// Fokus-Invalidierung (WP-5): sessionStorage-Attrappe, weil der Node-Testlauf
// kein window kennt. Ohne Ablauf zeigte die Erklaerbox alte, fremde Befunde.
function useFakeSessionStorage(): { restore(): void } {
  const store = new Map<string, string>()
  const host = globalThis as { window?: unknown }
  const previous = host.window
  host.window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value)
    }
  }
  return { restore: () => { host.window = previous } }
}

test('overview focus expires so a later visit does not show a foreign finding', () => {
  const fake = useFakeSessionStorage()
  try {
    const action = { label: 'Zu Prüfen', reason: 'Grund', route: 'updates' as const, focusId: 'watcher-daemon' }
    rememberOverviewFocus(action, 1_000)
    expect(readOverviewFocus('updates', 1_000 + OVERVIEW_FOCUS_TTL_MS)).toMatchObject({
      focusId: 'watcher-daemon',
      route: 'updates'
    })
    expect(readOverviewFocus('updates', 1_000 + OVERVIEW_FOCUS_TTL_MS + 1)).toBeNull()
    expect(readOverviewFocus('config', 1_000)).toBeNull()
  } finally {
    fake.restore()
  }
})

test('overview focus without timestamp counts as stale', () => {
  const fake = useFakeSessionStorage()
  try {
    const host = globalThis as { window?: { sessionStorage: { setItem(k: string, v: string): void } } }
    host.window?.sessionStorage.setItem(
      'rawallmconfig.overviewFocus',
      JSON.stringify({ label: 'alt', reason: 'alt', route: 'updates' })
    )
    expect(readOverviewFocus('updates', 5_000)).toBeNull()
  } finally {
    fake.restore()
  }
})

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

test('ollama system hint routes to the local sources setting without claiming a default folder', () => {
  const cards = buildDiagnosisCards({ config: null, system: ollamaSystemFixture(), watcher: null, errors: [] })
  const card = cards.find((item) => item.id === 'system-env-OLLAMA_*')
  const ollamaCards = cards.filter((item) => item.diagnosisAction.focusId === 'settings-tab-sources')
  expect(ollamaCards).toHaveLength(1)
  expect(card?.where).toBe('Einstellungen > Lokale Quellen')
  expect(card?.diagnosisAction).toMatchObject({
    route: 'settings',
    focusId: 'settings-tab-sources'
  })
  expect(card?.title).toBe('Lokale Modelle prüfen')
  expect(card?.meaning).toContain('Hinweise zu Ollama')
  expect(card?.how).toContain('Lokale Quellen')
  expect(card?.changeHint).toContain('noch kein Modellordner')
  expect(card?.details).toEqual(expect.arrayContaining([
    expect.stringContaining('OLLAMA_*'),
    expect.stringContaining('Ollama-Ordner')
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
