// overview-zones-teil-e.spec.ts — Teilplan E (E-WP1a): pinnt die verbindliche
// Overview-Zonen-Reihenfolge und die DisplayMode-Struktur-Weiche (Owner-
// Entscheid D1-D3 vom 2026-07-18) auf Source-Ebene.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const diagnosisCards = read('src/renderer/sections/overview/DiagnosisCards.tsx')
const coverageRegister = read('src/renderer/sections/overview/CoverageRegister.tsx')

test('zones keep the binding order status, next action, findings, register, area paths', () => {
  const content = modeContent()
  const zoneOrder = ['<OverviewStatus', '<NextAction', '<DiagnosisCards', '<CoverageRegister', '<GuidedFlows', '<TaskGrid']
  for (let index = 1; index < zoneOrder.length; index++) {
    expect(
      content.indexOf(zoneOrder[index]),
      `${zoneOrder[index - 1]} muss vor ${zoneOrder[index]} liegen`
    ).toBeGreaterThan(content.indexOf(zoneOrder[index - 1]))
  }
})

test('readiness rows and coverage register render in expert mode only', () => {
  // F-WP2d D2: der MetricStrip ist den Readiness-Registerzeilen gewichen;
  // die Experten-Sichtbarkeit der Zone bleibt unveraendert.
  const status = between(overviewSection, 'function OverviewStatus', 'function ReadinessRows')
  expect(status).toContain("displayMode === 'expert' && <ReadinessRows")
  expect(modeContent()).toContain("props.displayMode === 'expert' && <CoverageRegister")
})

test('acknowledged line renders in simple mode only and only above zero', () => {
  expect(modeContent()).toContain("props.displayMode === 'simple' && <CoverageAckLine")
  const ackLine = between(coverageRegister, 'export function CoverageAckLine', 'function CoverageFilters')
  expect(ackLine).toContain('if (count <= 0) return null')
  expect(ackLine).toContain("msg('coverage.confirmed.simpleLine', { count: String(count) })")
  expect(ackLine).not.toContain('ov-coverage-filters')
  expect(ackLine).not.toContain('entry.path')
})

test('diagnosis cards show real findings only, the coverage list lives in the register', () => {
  expect(diagnosisCards).not.toContain('CoverageList')
  expect(diagnosisCards).not.toContain('coverageEntries')
  expect(diagnosisCards).not.toContain('ov-coverage')
  expect(coverageRegister).toContain('filterCoverageRows')
  expect(coverageRegister).toContain('ov-coverage-filters')
  expect(coverageRegister).toContain("props.displayMode === 'expert' && <span>{entry.path}</span>")
  expect(coverageRegister).toContain("msg('coverage.panel.title')")
})

test('ack action renders only for unacknowledged rows with a disabled path (E-WP3 L1)', () => {
  expect(coverageRegister).toContain("msg('coverage.action.ack')")
  expect(coverageRegister).toContain("entry.status !== 'acknowledged'")
  expect(coverageRegister).toContain('disabled={props.ackDisabled}')
  expect(coverageRegister).toContain('props.ackDisabledReason')
  expect(coverageRegister).toContain('onAck(row')
  expect(modeContent()).toContain("ackDisabledReason={msg('coverage.action.ackDisabled')}")
  expect(modeContent()).toContain('onAck={props.onAck}')
})

test('area paths zone bundles guided flows and task grid for both display modes', () => {
  const zone = areaPathsZone()
  expect(zone).toContain("msg('overview.zone.areaPaths')")
  expect(zone).toContain('<GuidedFlows')
  expect(zone).toContain('<TaskGrid')
  expect(zone).not.toContain("displayMode === 'expert' &&")
  expect(zone).not.toContain("displayMode === 'simple' &&")
})

test('overview head anchors the display mode switch (owner decision d1)', () => {
  const head = between(overviewSection, 'function OverviewHead', 'function OverviewStatus')
  expect(head).toContain('<DisplayModeSwitch')
  // Teilplan F: Verdrahtung ueber useDisplayModeSwitch (optimistisch + Transition).
  expect(head).toContain('useDisplayModeSwitch(')
})

function areaPathsZone(): string {
  const content = modeContent()
  const start = content.indexOf('ov-zone-paths')
  return content.slice(start, content.indexOf('</section>', start))
}

function modeContent(): string {
  return between(overviewSection, 'function OverviewModeContent', 'function OverviewHead')
}

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
