import { expect, test } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'

test('overview counts a userglobal clone only once', () => {
  const config: AppData = {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: {
      claude: family('entry-conflict'),
      userglobal: family('userglobal-claude-entry-conflict'),
    },
  }

  const model = buildOverviewModel({ config, system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(model.warningCount).toBe(1)
})

function family(id: string) {
  return {
    categories: [{ id: 'plugins', label: 'Plugins', icon: 'plug', path: '', blurb: '', entries: [{
      id, name: 'server', status: 'conflict' as const, scope: 'global' as const, path: '', desc: '', updated: '',
    }] }],
    duplicates: [],
  }
}

function readySystem() {
  return { updated: '', areas: [{ id: 'runtime', label: 'Runtime', icon: '', blurb: '', entries: [{ name: 'Node', status: 'active' as const, desc: '' }] }] }
}

function readyWatcher() {
  return { daemon: { status: 'running', lastResult: '', schedule: '', tokens: '', sources: 1, updated: '', note: '' }, tiers: [], sources: [{ name: 'Codex', kind: '', current: '', latest: '', tier: 1 as const, state: 'current' as const }], changelogs: [] }
}
