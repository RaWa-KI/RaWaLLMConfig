import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const store = read('src/renderer/state/store.tsx')
const taskCard = read('src/renderer/sections/overview/TaskCard.tsx')

test('task DOM keeps safe copy for simple mode and adds technical detail for expert mode', () => {
  expect(taskCard).toContain('<span className="ov-task-meaning">{task.meaning}</span>')
  expect(taskCard).toContain("{displayMode === 'expert' && <ExpertDetails task={task} />}")
  expect(taskCard).toContain("msg('expertDetails.technicalName', { term: task.expertTarget })")
  expect(taskCard).toContain("msg('expertDetails.rawTarget', { target: task.target })")
})

test('overview changes the section order between simple and expert', () => {
  const simple = between('function SimpleOverview', 'function ExpertOverview')
  const expert = between('function ExpertOverview', 'type OverviewModeContentProps')

  expect(simple.indexOf('<NextAction')).toBeLessThan(simple.indexOf('<GuidedFlows'))
  expect(simple.indexOf('<GuidedFlows')).toBeLessThan(simple.indexOf('<OverviewStatus'))
  expect(expert.indexOf('<OverviewStatus')).toBeLessThan(expert.indexOf('<DiagnosisCards'))
  expect(expert.indexOf('<DiagnosisCards')).toBeLessThan(expert.indexOf('<NextAction'))
})

test('display mode reloads from and persists to the existing local UI state', () => {
  expect(store).toContain("const DISPLAY_MODE_KEY = 'rawallmconfig.displayMode'")
  expect(store).toContain('useState<DisplayMode>(readDisplayMode)')
  expect(store).toContain('window.localStorage.getItem(DISPLAY_MODE_KEY)')
  expect(store).toContain('window.localStorage.setItem(DISPLAY_MODE_KEY, mode)')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function between(start: string, end: string): string {
  return overviewSection.slice(overviewSection.indexOf(start), overviewSection.indexOf(end))
}
