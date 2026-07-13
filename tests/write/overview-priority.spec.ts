import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const overviewSection = readFileSync(resolve(process.cwd(), 'src/renderer/sections/overview/OverviewSection.tsx'), 'utf8')

test('overview presents one safe primary action before flows, status and diagnostics', () => {
  const nextAction = overviewSection.indexOf('<NextAction')
  const flows = overviewSection.indexOf('<GuidedFlows')
  const status = overviewSection.indexOf('<OverviewStatus')
  const diagnostics = overviewSection.indexOf('<DiagnosisCards')

  expect(nextAction).toBeGreaterThan(0)
  expect(nextAction).toBeLessThan(flows)
  expect(flows).toBeLessThan(status)
  expect(status).toBeLessThan(diagnostics)
  expect(overviewSection).toContain("!task.primary && (props.displayMode === 'expert' || task.id !== 'expert')")
})
