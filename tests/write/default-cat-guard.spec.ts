import { test, expect } from '@playwright/test'
import type { Category } from '../../shared/contract'
import type { OverviewNavigationAction } from '../../src/renderer/sections/overview/overview-navigation'
import { shouldApplyDefaultCat } from '../../src/renderer/state/default-cat-guard'

// WP-1 (B1) Guided-Focus-Race: Pure Spec fuer den Default-Kategorie-Guard.
// Solange ein Config-Focus ansteht (gefuehrter Sprung aus einer Diagnosekarte),
// darf der Store die Default-Kategorie cats[0] NICHT setzen.

const cats: Category[] = [
  { id: 'gguf-models', label: 'GGUF-Modelle', icon: '', path: '', blurb: '', entries: [] },
  { id: 'llm-endpoints', label: 'Inferenz-Endpoints', icon: '', path: '', blurb: '', entries: [] }
]

const pendingFocus: OverviewNavigationAction = {
  label: 'Endpoint öffnen',
  reason: 'Der Dienst antwortet nicht.',
  route: 'config',
  focusId: 'config-entry-local-llama-server'
}

test('anstehender Config-Focus blockiert den Default-Kategorie-Override', () => {
  // catId noch nicht gesetzt (Rennen nach Familienwechsel): kein Override.
  expect(shouldApplyDefaultCat(cats, null, pendingFocus)).toBe(false)
  // catId gehoert noch zur alten Familie (stale): ebenfalls kein Override.
  expect(shouldApplyDefaultCat(cats, 'codex-plugins', pendingFocus)).toBe(false)
})

test('ohne Focus gilt das bisherige Default-Verhalten', () => {
  expect(shouldApplyDefaultCat(cats, null, null)).toBe(true)
  expect(shouldApplyDefaultCat(cats, 'unbekannte-kategorie', null)).toBe(true)
  expect(shouldApplyDefaultCat(cats, 'llm-endpoints', null)).toBe(false)
})

test('leere Kategorie-Liste setzt nie einen Default', () => {
  expect(shouldApplyDefaultCat([], null, null)).toBe(false)
  expect(shouldApplyDefaultCat([], null, pendingFocus)).toBe(false)
})
