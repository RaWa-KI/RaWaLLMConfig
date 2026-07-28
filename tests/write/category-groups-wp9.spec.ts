import { test, expect } from '@playwright/test'
import type { Category, ConfigEntry, EntryStatus } from '../../shared/contract'
import {
  categoryFlag,
  groupCategoriesBySource,
  sourceHeading
} from '../../src/renderer/sections/config/category-groups'

// WP-9: reine Gruppierungs-Logik der Kategorie-Sidebar (HR27-Auflage: eigenes,
// testbares Modul). Hintergrund: in der Userglobal-Familie standen gleichnamige
// Kategorien aus Claude, Codex und Kimi flach untereinander — der Klick traf
// die falsche Datei.

function cat(id: string, entries: ConfigEntry[] = []): Category {
  return { id, label: id, icon: 'skill', path: `/${id}`, blurb: '', entries } as Category
}

function entry(status: EntryStatus): ConfigEntry {
  return { id: `e-${status}`, name: status, status, scope: 'global', path: '', desc: '', updated: '' } as ConfigEntry
}

test('groupCategoriesBySource splits userglobal categories per tool', () => {
  const groups = groupCategoriesBySource([
    cat('userglobal-claude-agents'),
    cat('userglobal-claude-skills'),
    cat('userglobal-codex-agents'),
    cat('userglobal-agents-skills')
  ])
  expect(groups.map((g) => g.key)).toEqual(['claude', 'codex', 'kimi'])
  expect(groups.map((g) => g.title)).toEqual(['Werkzeug: Claude', 'Werkzeug: Codex', 'Werkzeug: Kimi'])
  expect(groups[0].categories.map((c) => c.id)).toEqual(['userglobal-claude-agents', 'userglobal-claude-skills'])
  expect(groups[2].categories).toHaveLength(1)
})

test('groupCategoriesBySource keeps single-family lists flat and lossless', () => {
  const flat = [cat('rules'), cat('skills'), cat('agents')]
  const groups = groupCategoriesBySource(flat)
  expect(groups).toHaveLength(1)
  // Keine Ueberschrift, wo die Quelle schon durch die Familie eindeutig ist.
  expect(groups[0].title).toBeNull()
  expect(groups[0].categories.map((c) => c.id)).toEqual(['rules', 'skills', 'agents'])
  // Nichts geht verloren, nichts wird umsortiert.
  expect(groupCategoriesBySource([])).toEqual([])
})

test('sourceHeading is plain German and names the tool', () => {
  expect(sourceHeading('Claude')).toBe('Werkzeug: Claude')
  expect(sourceHeading('Kimi')).toBe('Werkzeug: Kimi')
})

test('categoryFlag keeps the conflict > stale > dup precedence', () => {
  expect(categoryFlag(cat('a', [entry('active')]))).toBeNull()
  expect(categoryFlag(cat('a', [entry('dup')]))).toBe('var(--papa)')
  expect(categoryFlag(cat('a', [entry('stale'), entry('dup')]))).toBe('var(--amber)')
  expect(categoryFlag(cat('a', [entry('conflict'), entry('stale')]))).toBe('var(--terra)')
})
