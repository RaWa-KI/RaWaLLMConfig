import { test, expect } from '@playwright/test'
import type { AppData, System, Watcher } from '../../shared/contract'
import { actionVisibleForMode } from '../../src/renderer/state/section-visibility'
import { buildDiagnosisCards, pickNextDiagnosisCard } from '../../src/renderer/sections/overview/diagnosis-model'

// Befunde 2026-07-19 (Simple-Modus): Diagnose-Route auf einen Experten-Tab der
// Einstellungen landete beim Laien auf dem Darstellungs-Tab ohne Fuehrung;
// dieselbe Karte erschien doppelt (Aktions-Zeile + Diagnose-Liste); die Zeilen
// trugen generische Statusfloskeln statt des konkreten Ziels.

test('actionVisibleForMode: Einstellungs-Experten-Tabs sind im Simple-Modus tote Ziele', () => {
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-sources' }, 'simple')).toBe(false)
  // WP-F6: der Updates-Tab ist in beiden Modi sichtbar — die Diagnose-Route
  // dorthin loest auch im Simple-Modus auf.
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-updates' }, 'simple')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-modules' }, 'simple')).toBe(false)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-sources' }, 'expert')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings' }, 'simple')).toBe(true)
  expect(actionVisibleForMode({ route: 'system' }, 'simple')).toBe(false)
  expect(actionVisibleForMode({ route: 'updates' }, 'simple')).toBe(true)
})

test('pickNextDiagnosisCard ueberspringt im Simple-Modus Karten mit Experten-Ziel', () => {
  const cards = buildDiagnosisCards({ config: null, system: ollamaSystemFixture(), watcher: watcherFixture(), errors: [] })
  const simpleNext = pickNextDiagnosisCard(cards, 'simple')
  expect(simpleNext?.diagnosisAction.route).toBe('updates')
  const expertNext = pickNextDiagnosisCard(cards, 'expert')
  expect(expertNext?.diagnosisAction.focusId).toBe('settings-tab-sources')
})

test('diagnose-karten tragen das konkrete Ziel als Titel statt einer Statusfloskel', () => {
  const cards = buildDiagnosisCards({ config: pluginCacheConfig(), system: null, watcher: null, errors: [] })
  const card = cards.find((item) => item.id === 'entry-codex-codex-plugins-cache')
  expect(card?.title).toBe('cache (Plugins)')
  expect(card?.title).not.toBe('Ein Problem wurde gefunden')
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
      }]
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
