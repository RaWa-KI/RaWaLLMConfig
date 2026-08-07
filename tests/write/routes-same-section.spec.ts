import { test, expect } from '@playwright/test'
import type { AppData, EntryStatus } from '../../shared/contract'
import type { Mode, Selection, StoreActions } from '../../src/renderer/state/types'
import { resolveConfigFocusTarget } from '../../src/renderer/sections/config/config-focus'
import { applyConfigFocusTarget } from '../../src/renderer/sections/config/config-focus-apply'
import { shouldApplyDefaultCat } from '../../src/renderer/state/default-cat-guard'
import {
  clearOverviewFocus,
  getOverviewFocusVersion,
  navigateToOverviewAction,
  readOverviewFocus,
  subscribeOverviewFocus
} from '../../src/renderer/sections/overview/overview-navigation'

// Routen-Sweep (P1, 2026-08-07): „Problem prüfen: claude Dubletten" auf der
// Hinweise-Seite (Config-Sektion) war ein toter Klick. Root-Cause:
// navigateToOverviewAction schreibt den Fokus nur in sessionStorage und ruft
// setSection(section) — liegt das Ziel in der BEREITS aktiven Sektion, ändert
// sich kein React-State, kein Effekt liest den Fokus, nichts passiert.
// Diese Spec stellt den toten Klick nach (Repro) und pinnt den Fix:
// (1) jede Fokus-Änderung erzeugt ein beobachtbares Signal (Version + Listener),
// (2) der geteilte Apply-Pfad führt jede config-* Fokus-Familie zum sichtbaren
//     Ziel (Dubletten → Kategorie + Diff-Modus, Entry → Drawer, Familie → LLM).

function useFakeSessionStorage(): { restore(): void } {
  const store = new Map<string, string>()
  const host = globalThis as { window?: unknown }
  const previous = host.window
  host.window = {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key)
    }
  }
  return { restore: () => { host.window = previous } }
}

test('Repro: Same-Section-Klick schreibt den Fokus, ohne die Sektion zu ändern', () => {
  const fake = useFakeSessionStorage()
  try {
    // Nutzer steht in 'config' (Hinweise-Seite) — die Diagnose-Aktion zielt
    // ebenfalls auf 'config'. onOpen erhält dieselbe Sektion: kein State-
    // Wechsel, kein Mount. Ohne Fokus-Signal wäre der Klick unsichtbar.
    const opened: string[] = []
    navigateToOverviewAction(
      { label: 'Problem prüfen: claude Dubletten', reason: 'Doppelt vorhanden', route: 'config', focusId: 'config-duplicates-claude' },
      (section) => opened.push(section)
    )
    expect(opened).toEqual(['config'])
    expect(readOverviewFocus('config')?.focusId).toBe('config-duplicates-claude')
  } finally {
    clearOverviewFocus()
    fake.restore()
  }
})

test('Fix: Merken und Verwerfen des Fokus erhöhen die Version und feuern Listener', () => {
  const fake = useFakeSessionStorage()
  try {
    let fired = 0
    const unsubscribe = subscribeOverviewFocus(() => { fired += 1 })
    const before = getOverviewFocusVersion()
    navigateToOverviewAction(
      { label: 'Problem prüfen: claude Dubletten', reason: 'Doppelt vorhanden', route: 'config', focusId: 'config-duplicates-claude' },
      () => {}
    )
    expect(fired).toBe(1)
    expect(getOverviewFocusVersion()).toBe(before + 1)
    clearOverviewFocus()
    expect(fired).toBe(2)
    expect(getOverviewFocusVersion()).toBe(before + 2)
    unsubscribe()
    navigateToOverviewAction(
      { label: 'x', reason: 'y', route: 'config', focusId: 'config-duplicates-claude' },
      () => {}
    )
    expect(fired).toBe(2)
  } finally {
    clearOverviewFocus()
    fake.restore()
  }
})

interface RecordedActions {
  actions: StoreActions
  calls: string[]
}

function recordingActions(): RecordedActions {
  const calls: string[] = []
  const record = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.map(String).join(',')})`)
  const actions = {
    setSection: record('setSection'),
    setLlm: record('setLlm'),
    setCatId: record('setCatId'),
    setMode: record('setMode'),
    setDisplayMode: record('setDisplayMode'),
    setSearch: record('setSearch'),
    toggleStatusFilter: record('toggleStatusFilter'),
    setSysArea: record('setSysArea'),
    openEntry: record('openEntry'),
    closeEntry: record('closeEntry'),
    showToast: record('showToast'),
    reload: record('reload'),
    reloadConfig: record('reloadConfig'),
    toggleCompare: record('toggleCompare'),
    setCompareSelection: record('setCompareSelection'),
    clearCompare: record('clearCompare'),
    setComparePreset: record('setComparePreset'),
    clearComparePreset: record('clearComparePreset'),
    openImportDialog: record('openImportDialog'),
    closeImportDialog: record('closeImportDialog')
  } as unknown as StoreActions
  return { actions, calls }
}

function uiState(overrides: Partial<{ llm: string; catId: string | null; mode: Mode; search: string; statusFilter: EntryStatus | null; sel: Selection | null }> = {}) {
  return { llm: 'claude', catId: 'diagnose', mode: 'overview' as Mode, search: '', statusFilter: null, sel: null, ...overrides }
}

function duplicatesConfig(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [{ id: 'claude', glyph: '', name: 'Claude', sub: '', color: '', path: '' }],
    data: {
      claude: {
        categories: [
          { id: 'claude-skills', label: 'Skills', icon: 'plug', path: '', blurb: '', entries: [] },
          { id: 'claude-rules', label: 'Rules', icon: 'plug', path: '', blurb: '', entries: [] }
        ],
        duplicates: [{ name: 'skill-mirror-pair', cat: 'claude-skills', kind: 'mirror', items: [] } as never]
      }
    }
  }
}

test('Dubletten-Fokus führt in der aktiven Familie zu Kategorie + Diff-Modus', () => {
  const config = duplicatesConfig()
  const target = resolveConfigFocusTarget(config, 'config-duplicates-claude')
  expect(target).toEqual({ kind: 'duplicates', llm: 'claude', catId: 'claude-skills' })
  const first = recordingActions()
  // Erster Lauf stoesst die Aktionen an — Zielzustand noch nicht bestaetigt.
  expect(applyConfigFocusTarget(target!, uiState(), first.actions)).toBe(false)
  expect(first.calls).toEqual(['setCatId(claude-skills)', 'setMode(diff)'])
  // Konvergenz: Ist der Zielzustand erreicht, bestaetigt der Lauf ohne Aktion.
  const second = recordingActions()
  expect(applyConfigFocusTarget(target!, uiState({ catId: 'claude-skills', mode: 'diff' }), second.actions)).toBe(true)
  expect(second.calls).toEqual([])
})

test('Dubletten-Fokus in fremder Familie wechselt erst die Familie', () => {
  const target = resolveConfigFocusTarget(duplicatesConfig(), 'config-duplicates-claude')
  const { actions, calls } = recordingActions()
  const done = applyConfigFocusTarget(target!, uiState({ llm: 'codex' }), actions)
  expect(done).toBe(false)
  expect(calls).toEqual(['setLlm(claude)'])
})

test('Entry-Fokus öffnet Kategorie, Übersicht und Drawer; Suche/Filter werden geleert', () => {
  const target = { kind: 'entry', llm: 'claude', catId: 'claude-skills', entryId: 'skill-1' } as const
  const first = recordingActions()
  const done = applyConfigFocusTarget(
    target,
    uiState({ mode: 'diff', search: 'foo', statusFilter: 'conflict' }),
    first.actions
  )
  expect(done).toBe(false)
  expect(first.calls).toEqual([
    'setSearch()',
    'toggleStatusFilter(conflict)',
    'setCatId(claude-skills)',
    'setMode(overview)',
    'openEntry(claude-skills,skill-1)'
  ])
  const second = recordingActions()
  expect(applyConfigFocusTarget(
    target,
    uiState({ catId: 'claude-skills', mode: 'overview', sel: { catId: 'claude-skills', entryId: 'skill-1' } }),
    second.actions
  )).toBe(true)
  expect(second.calls).toEqual([])
})

test('Familien-Fokus in der aktiven Familie ist ohne weiteren Eingriff angewendet', () => {
  const { actions, calls } = recordingActions()
  expect(applyConfigFocusTarget({ kind: 'family', llm: 'claude' }, uiState(), actions)).toBe(true)
  expect(calls).toEqual([])
})

test('Dubletten-Fokus blockiert den Default-Kategorie-Override wie ein Entry-Fokus', () => {
  const cats = duplicatesConfig().data.claude.categories
  const focus = { label: 'x', reason: 'y', route: 'config' as const, focusId: 'config-duplicates-claude' }
  expect(shouldApplyDefaultCat(cats, null, focus)).toBe(false)
  expect(shouldApplyDefaultCat(cats, 'stale-cat', focus)).toBe(false)
  expect(shouldApplyDefaultCat(cats, null, null)).toBe(true)
})
