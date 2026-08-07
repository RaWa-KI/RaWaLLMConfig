import { expect, test } from '@playwright/test'
import type { AppData, System, Watcher } from '../../shared/contract'
import { deMessages } from '../../shared/messages'
import { resolveConfigFocusTarget } from '../../src/renderer/sections/config/config-focus'
import { resolveFocusJump } from '../../src/renderer/sections/overview/diagnosis-focus-resolvers'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { shouldApplyDefaultCat } from '../../src/renderer/state/default-cat-guard'

// WP-F1F8: Je focusId-Familie gilt — aufloesbares Ziel liefert ein Sprungziel
// (FocusNotice zeigt den Details-Link), nicht aufloesbares Ziel liefert null
// (kein Link, ehrlicher Text). Zusaetzlich pinnt der Spec, dass der
// notFound-Kartentext das Details-Versprechen nur mit Sprungziel traegt.

const data = () => ({ config: config(), system: system(), watcher: watcher() })

test('config-entry: vorhandener Eintrag loest auf, fremder nicht', () => {
  const jump = resolveFocusJump('config', 'config-entry-codex-hooks-a', data())
  expect(jump).toEqual({ kind: 'config', target: { kind: 'entry', llm: 'codex', catId: 'hooks', entryId: 'hooks-a' } })
  expect(resolveFocusJump('config', 'config-entry-codex-geloescht', data())).toBeNull()
})

test('config-llm und config-family: bekannte Familie loest auf, unbekannte nicht', () => {
  expect(resolveFocusJump('config', 'config-llm-codex', data())).toEqual({ kind: 'config', target: { kind: 'family', llm: 'codex' } })
  expect(resolveFocusJump('config', 'config-family-codex', data())).toEqual({ kind: 'config', target: { kind: 'family', llm: 'codex' } })
  expect(resolveFocusJump('config', 'config-family-fremd', data())).toBeNull()
})

test('config-duplicates: Familie mit Dubletten loest auf Kategorie im Diff-Modus auf', () => {
  const jump = resolveFocusJump('config', 'config-duplicates-codex', data())
  expect(jump).toEqual({ kind: 'config', target: { kind: 'duplicates', llm: 'codex', catId: 'hooks' } })
  expect(resolveFocusJump('config', 'config-duplicates-leer', data())).toBeNull()
})

test('system-entry: bekannter Bereich loest auf Bereich + Zeile auf', () => {
  const jump = resolveFocusJump('system', 'system-entry-runtime-php', data())
  expect(jump).toEqual({ kind: 'system', areaId: 'runtime', rowId: 'system-entry-runtime-php' })
  expect(resolveFocusJump('system', 'system-entry-fremd-php', data())).toBeNull()
})

test('settings-tab: Tab-Fokus loest auf Element-Klickziel auf', () => {
  expect(resolveFocusJump('settings', 'settings-tab-sources', data()))
    .toEqual({ kind: 'settingsTab', elementId: 'settings-tab-sources' })
  expect(resolveFocusJump('settings', 'irgendwas', data())).toBeNull()
})

test('watcher-daemon und watcher-source: bekannte Quelle loest auf, fremde nicht', () => {
  expect(resolveFocusJump('updates', 'watcher-daemon', data()))
    .toEqual({ kind: 'element', elementId: 'watcher-daemon' })
  expect(resolveFocusJump('updates', 'watcher-source-Codex', data()))
    .toEqual({ kind: 'element', elementId: 'watcher-source-Codex' })
  expect(resolveFocusJump('updates', 'watcher-source-Fremd', data())).toBeNull()
})

test('load-*: App-Ladefehler haben bewusst kein Sprungziel', () => {
  expect(resolveFocusJump('updates', 'load-0', data())).toBeNull()
})

test('resolveConfigFocusTarget: ohne Daten oder ohne focusId kein Ziel', () => {
  expect(resolveConfigFocusTarget(null, 'config-entry-codex-hooks-a')).toBeNull()
  expect(resolveConfigFocusTarget(config(), null)).toBeNull()
})

test('notFound-Karte: Details-Versprechen nur mit Sprungziel, sonst Fundstelle im Text', () => {
  // stale-Eintrag → notFound MIT focusId → Basistext mit Details-Versprechen.
  const cards = buildDiagnosisCards({ config: config(), system: system(), watcher: watcher(), errors: [] })
  const staleCard = cards.find((card) => card.id === 'entry-codex-hooks-stale')
  expect(staleCard?.diagnosisAction.focusId).toBe('config-entry-codex-hooks-stale')
  // Leere Config-Familie ohne focusId → Fundstelle direkt im Kartentext,
  // KEIN Details-Versprechen.
  const empty = buildDiagnosisCards({ config: emptyConfig(), system: system(), watcher: watcher(), errors: [] })
  const emptyCard = empty.find((card) => card.id === 'config-empty')
  expect(emptyCard?.meaning).toBe(
    deMessages['diagnostics.meaning.notFoundAt'].replace('{place}', deMessages['diagnostics.source.config'])
  )
  expect(emptyCard?.meaning).not.toContain('Details')
})

// Routen-Sweep 2026-08-07: Dubletten-Fokusse setzen ihre Ziel-Kategorie jetzt
// selbst (ConfigSection-Fokus-Effekt) und blockieren den Default daher wie
// Entry-Fokusse. Familien-Fokusse setzen keine Kategorie — dort greift der
// Default weiter (ohne ihn bliebe die Config ohne Kategorie haengen).
test('Default-Kategorie: Entry- und Dubletten-Fokus blockieren, Familien-Fokus nicht', () => {
  const cats = config().data.codex.categories
  const focus = (focusId?: string) => ({ label: 'x', reason: 'y', route: 'config' as const, focusId })
  expect(shouldApplyDefaultCat(cats, null, focus('config-entry-codex-hooks-a'))).toBe(false)
  expect(shouldApplyDefaultCat(cats, null, focus('config-duplicates-codex'))).toBe(false)
  expect(shouldApplyDefaultCat(cats, null, focus('config-family-codex'))).toBe(true)
})

function config(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [{ id: 'codex', glyph: '', name: 'Codex', sub: '', color: '', path: '' }],
    data: {
      codex: {
        categories: [{
          id: 'hooks', label: 'Hooks', icon: 'gear', path: '', blurb: '',
          entries: [
            { id: 'hooks-a', name: 'hooks-a', status: 'active', scope: 'global', path: 'a', desc: '', updated: 'today' },
            { id: 'hooks-stale', name: 'hooks-stale', status: 'stale', scope: 'global', path: 'b', desc: '', updated: 'today' }
          ]
        }],
        duplicates: [{ cat: 'hooks', name: 'Dup', verdict: 'diff', trunk: { path: 'x', updated: 'today' }, mirror: { path: 'y', updated: 'today' }, note: '', lines: [] }]
      },
      leer: { categories: [], duplicates: [] }
    }
  }
}

function emptyConfig(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [],
    data: { codex: { categories: [{ id: 'hooks', label: 'Hooks', icon: 'gear', path: '', blurb: '', entries: [] }], duplicates: [] } }
  }
}

function system(): System {
  return {
    updated: 'today',
    areas: [{ id: 'runtime', label: 'Runtime', icon: 'gear', blurb: '', entries: [{ id: 'php', name: 'PHP', status: 'active', desc: '' }] }]
  }
}

function watcher(): Watcher {
  return {
    daemon: { status: 'Ready', lastResult: '0', schedule: '-', tokens: '-', sources: 1, updated: 'today', note: '' },
    tiers: [],
    sources: [{ name: 'Codex', kind: 'CLI', current: '1', latest: '1', tier: 1, state: 'current' }],
    changelogs: []
  }
}
