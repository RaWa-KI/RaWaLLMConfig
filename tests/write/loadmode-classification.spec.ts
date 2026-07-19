import { expect, test } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'

test('on-demand conflicts stay in coverage instead of the open diagnosis count', () => {
  const config = configWithOnDemandConflict()
  const cards = buildDiagnosisCards({ config, system: readySystem(), watcher: readyWatcher(), errors: [] })
  const model = buildOverviewModel({ config, system: readySystem(), watcher: readyWatcher(), errors: [] })

  expect(cards.some((card) => card.id === 'entry-claude-skill-on-demand')).toBe(false)
  expect(model.warningCount).toBe(0)
})

function configWithOnDemandConflict(): AppData {
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: { claude: { categories: [{ id: 'skills', label: 'Skills', icon: '', path: '', blurb: '', entries: [{
      id: 'skill-on-demand', name: 'lazy-skill', status: 'conflict', scope: 'global', path: '', desc: '', updated: '', loadMode: 'bei-bedarf',
    }] }], duplicates: [] } },
  }
}

function readySystem() {
  return { updated: '', areas: [{ id: 'runtime', label: 'Runtime', icon: '', blurb: '', entries: [{ name: 'Node', status: 'active' as const, desc: '' }] }] }
}

function readyWatcher() {
  return { daemon: { status: 'running', lastResult: '', schedule: '', tokens: '', sources: 1, updated: '', note: '' }, tiers: [], sources: [{ name: 'Codex', kind: '', current: '', latest: '', tier: 1 as const, state: 'current' as const }], changelogs: [] }
}
