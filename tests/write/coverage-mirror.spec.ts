import { test, expect } from '@playwright/test'
import type { CoverageRow } from '../../shared/contract'
import { coverageMirrorPlan, coverageMirrorPlans } from '../../src/renderer/sections/coverage/coverage-mirror'

function row(extra: Partial<CoverageRow>): CoverageRow {
  return {
    cat: 'rules',
    name: 'mirror-rule',
    shared: { state: 'identisch', path: 'C:/cfg/shared/mirror-rule.md' },
    claude: { state: 'identisch', path: 'C:/cfg/claude/mirror-rule.md' },
    codex: { state: 'identisch', path: 'C:/cfg/codex/mirror-rule.md' },
    ...extra
  }
}

test('Coverage-Spiegelaktion: abweichende Zielseite wird per edit geplant', () => {
  const plan = coverageMirrorPlan(row({ codex: { state: 'abweichend', path: 'C:/cfg/codex/mirror-rule.md' } }), 'codex')
  expect(plan).toMatchObject({
    action: 'edit',
    sourceFamily: 'shared',
    sourcePath: 'C:/cfg/shared/mirror-rule.md',
    targetPath: 'C:/cfg/codex/mirror-rule.md',
    disabledReason: null
  })
})

test('Coverage-Spiegelaktion: fehlende Zielseite bleibt ohne Zielpfad sichtbar gesperrt', () => {
  const plan = coverageMirrorPlan(row({ claude: { state: 'fehlt' } }), 'claude')
  expect(plan).toMatchObject({
    action: 'add',
    buttonLabel: 'Claude spiegeln',
    disabledReason: 'Nicht gespiegelt: Zielpfad fehlt im Scan.'
  })
})

test('Coverage-Spiegelaktion: maskierte Rows schreiben keinen Inhalt', () => {
  const plans = coverageMirrorPlans(row({
    masked: true,
    codex: { state: 'abweichend', path: 'C:/cfg/codex/mirror-rule.md' }
  }))
  expect(plans).toHaveLength(1)
  expect(plans[0].disabledReason).toBe('Nicht gespiegelt: Inhalt ist maskiert.')
})
