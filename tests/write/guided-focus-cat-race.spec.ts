import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { resolveConfigFocus } from '../../src/renderer/sections/config/config-focus'
import type { OverviewNavigationAction } from '../../src/renderer/sections/overview/overview-navigation'
import { shouldApplyDefaultCat } from '../../src/renderer/state/default-cat-guard'

// WP-1 (B1) Guided-Focus-Race: Ein gefuehrter Sprung aus einer Diagnosekarte
// landete beim 1. Klick auf der falschen Kategorie (GGUF-Modelle statt
// Inferenz-Endpoints), weil der Default-Kategorie-Effekt im Store das
// Focus-Ziel mit cats[0] ueberschrieb. Diese Spec pinnt (a) das Rennszenario
// fachlich und (b) die Guard-Verdrahtung im Store (Source-Pin nach Muster
// drawer-first-click.spec.ts).

const focusAction: OverviewNavigationAction = {
  label: 'llama-server öffnen',
  reason: 'Der Inferenz-Endpoint braucht Aufmerksamkeit.',
  route: 'config',
  focusId: 'config-entry-local-llama-server'
}

test('gefuehrter Sprung gewinnt gegen die Default-Kategorie, solange der Focus ansteht', () => {
  const data = raceFixture()
  const target = resolveConfigFocus(data, focusAction.focusId)
  expect(target).toEqual({ llm: 'local', catId: 'llm-endpoints', entryId: 'llama-server' })

  const cats = data.data['local']?.categories ?? []
  // Die Default-Kategorie waere GGUF-Modelle — genau das falsche Ziel aus B1.
  expect(cats[0]?.id).toBe('gguf-models')
  // Rennen: der Focus-Effekt hat catId noch nicht gesetzt (null nach Mount
  // bzw. stale nach Familienwechsel). Der Store-Default darf dann nicht
  // zugreifen — der Focus-Effekt setzt 'llm-endpoints' selbst.
  expect(shouldApplyDefaultCat(cats, null, focusAction)).toBe(false)
  expect(shouldApplyDefaultCat(cats, 'gguf-models', focusAction)).toBe(false)
  // Ohne anstehenden Focus bleibt der Default wie bisher aktiv.
  expect(shouldApplyDefaultCat(cats, null, null)).toBe(true)
})

test('Store-Default-Effekt ist ueber den Focus-Guard verdrahtet (Source-Pin)', () => {
  const store = readFileSync(join(process.cwd(), 'src/renderer/state/store.tsx'), 'utf8')
  expect(store).toContain("from './default-cat-guard'")
  expect(store).toContain('shouldApplyDefaultCat(cats, ui.state.catId)')

  const guard = readFileSync(join(process.cwd(), 'src/renderer/state/default-cat-guard.ts'), 'utf8')
  expect(guard).toContain("readOverviewFocus('config')")
  expect(guard).toContain('../sections/overview/overview-navigation')
})

function raceFixture(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [{ id: 'local', glyph: '', name: 'Lokale LLMs', sub: '', color: '', path: '' }],
    data: {
      local: {
        categories: [
          { id: 'gguf-models', label: 'GGUF-Modelle', icon: '', path: '', blurb: '', entries: [] },
          {
            id: 'llm-endpoints',
            label: 'Inferenz-Endpoints',
            icon: '',
            path: '',
            blurb: '',
            entries: [{
              id: 'llama-server',
              name: 'llama-server',
              status: 'conflict',
              scope: 'global',
              path: 'http://127.0.0.1:8080/',
              desc: 'Lokaler Inferenz-Server',
              updated: 'today'
            }]
          }
        ],
        duplicates: []
      }
    }
  }
}
