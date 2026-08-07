import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const overviewSection = readFileSync(resolve(process.cwd(), 'src/renderer/sections/overview/OverviewSection.tsx'), 'utf8')

test('overview keeps the safe primary action ahead of diagnostics (teilplan e order)', () => {
  const content = overviewSection.slice(
    overviewSection.indexOf('function OverviewModeContent'),
    overviewSection.indexOf('function OverviewHead')
  )
  const nextAction = content.indexOf('<NextAction')
  // WP3: im Overview steht nur noch die einzeilige Zusammenfassung; die
  // Karten leben in der Sidebar-Kategorie „Diagnose“.
  const diagnostics = content.indexOf('<DiagnosisSummary')

  expect(nextAction).toBeGreaterThan(0)
  expect(nextAction).toBeLessThan(diagnostics)
  expect(content).not.toContain('<DiagnosisCards')
  expect(overviewSection).toContain("!task.primary && (props.displayMode === 'expert' || task.id !== 'expert')")
})
