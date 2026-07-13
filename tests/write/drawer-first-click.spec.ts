import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { resolveConfigFocus } from '../../src/renderer/sections/config/config-focus'
import { navigateToOverviewAction, type OverviewNavigationAction } from '../../src/renderer/sections/overview/overview-navigation'

const firstClickAction: OverviewNavigationAction = {
  label: 'Plugin-Cache öffnen',
  reason: 'Der Eintrag braucht Aufmerksamkeit.',
  route: 'config',
  focusId: 'config-entry-codex-codex-plugins-cache'
}

test('first click routes directly to the intended category, entry and drawer overview', () => {
  let route: string | null = null
  navigateToOverviewAction(firstClickAction, (nextRoute) => { route = nextRoute })

  expect(route).toBe('config')
  expect(resolveConfigFocus(firstClickFixture(), firstClickAction.focusId)).toEqual({
    llm: 'codex',
    catId: 'codex-plugins',
    entryId: 'codex-plugins-cache'
  })

  const drawer = readFileSync(join(process.cwd(), 'src/renderer/components/Drawer.tsx'), 'utf8')
  expect(drawer).toContain("useState<Tab>('overview')")
  expect(drawer).toContain("setTab('overview')")
  expect(drawer).toContain('onClick={actions.closeEntry}')
})

function firstClickFixture(): AppData {
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
            updated: 'today'
          }]
        }],
        duplicates: []
      }
    }
  }
}
