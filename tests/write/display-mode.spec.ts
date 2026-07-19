import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const store = read('src/renderer/state/store.tsx')
const taskCard = read('src/renderer/sections/overview/TaskCard.tsx')

test('task DOM keeps safe copy for simple mode and adds technical detail for expert mode', () => {
  // F-WP2d D3: Bereichs-Navigation als Registerzeilen (Punkt, Titel, Kurzzeile,
  // Status rechts, Chevron) — die Bedeutung bleibt ueber die Experten-Details.
  expect(taskCard).toContain('<span className="ov-dot idle"')
  expect(taskCard).toContain('<span className="ov-task-body">{task.body}</span>')
  expect(taskCard).toContain('<span className="ov-task-state">')
  expect(taskCard).toContain("{displayMode === 'expert' && <ExpertDetails task={task} />}")
  expect(taskCard).toContain("msg('expertDetails.meaning', { meaning: task.meaning })")
  expect(taskCard).toContain("msg('expertDetails.technicalName', { term: task.expertTarget })")
  expect(taskCard).toContain("msg('expertDetails.rawTarget', { target: task.target })")
})

test('overview keeps status, action, findings, register and area-path zones in one stable order', () => {
  const overview = between('function OverviewModeContent', 'function OverviewHead')

  expect(overview.indexOf('<OverviewStatus')).toBeLessThan(overview.indexOf('<NextAction'))
  expect(overview.indexOf('<NextAction')).toBeLessThan(overview.indexOf('<DiagnosisCards'))
  expect(overview.indexOf('<DiagnosisCards')).toBeLessThan(overview.indexOf('<CoverageRegister'))
  expect(overview.indexOf('<CoverageRegister')).toBeLessThan(overview.indexOf('<GuidedFlows'))
  expect(overview.indexOf('<GuidedFlows')).toBeLessThan(overview.indexOf('<TaskGrid'))
  expect(overview).toContain('displayMode={props.displayMode}')
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
