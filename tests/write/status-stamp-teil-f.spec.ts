// status-stamp-teil-f.spec.ts — F-WP2d (Teil B): D2 Zustands-Stempel
// (Kontrollbuch-Regel a) und D3 Registerzeilen-Grundmuster (Regel b) fuer
// Diagnose-/Abdeckungs-/Bereichs-Listen. Verhaltenstests laufen gegen das
// Overview-Modell (buildOverviewModel) und die Message-Projektion; die
// Flaechen-Verdrahtung wird per Source-Pin gesichert (Muster: teil-e-Specs,
// tests/write hat bewusst kein Browser-Setup).
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppData, ConfigEntry, LlmConfig, System, Watcher } from '../../shared/contract'
import { msg } from '../../shared/messages'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'

const stamp = read('src/renderer/sections/overview/StatusStamp.tsx')
const stampCss = read('src/renderer/sections/overview/StatusStamp.css')
const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const overviewCss = read('src/renderer/sections/overview/OverviewSection.css')
const diagnosisCards = read('src/renderer/sections/overview/DiagnosisCards.tsx')
const diagnosisCss = read('src/renderer/sections/overview/DiagnosisCards.css')
const coverageRegister = read('src/renderer/sections/overview/CoverageRegister.tsx')
const taskCard = read('src/renderer/sections/overview/TaskCard.tsx')

// --- D2: Zustands-Stempel --------------------------------------------------

test('stamp text comes from state and stays mirrored in both locales', () => {
  expect(stamp).toContain('role="status"')
  expect(stamp).toContain("msg('overview.stamp.allClear')")
  expect(stamp).toContain("msg('overview.stamp.attention', { count: String(openCount) })")
  expect(msg('overview.stamp.allClear')).toBe('Alles in Ordnung')
  expect(msg('overview.stamp.attention', { count: '17' })).toBe('17 Dinge ansehen')
  expect(msg('overview.stamp.attention', { count: '17' }, 'en')).toBe('17 things to review')
})

test('stamp styling follows the kontrollbuch discipline', () => {
  // Display-Font (D4), 2–3° Rotation, 1–2px Kontur, kein Schatten, max. 8%-Tint.
  expect(stampCss).toContain('font-family: var(--font-display)')
  expect(stampCss).toContain('transform: rotate(-2.5deg)')
  expect(stampCss).toContain('border: 2px solid var(--amber-d)')
  expect(stampCss).toContain('box-shadow: none')
  expect(stampCss).toContain('var(--amber) 8%')
  // ok-Zustand: --sage-Kontur + 8%-Tint (einzige sage-Flaeche neben Punkten).
  expect(stampCss).toContain('border-color: var(--sage-d)')
  expect(stampCss).toContain('var(--sage) 8%')
  expect(stampCss).not.toContain('var(--papa)')
})

test('stamp is wired to the real open counter, not a scan diff total', () => {
  expect(overviewSection).toContain('<StatusStamp openCount={props.openCount} />')
  expect(overviewSection).toContain('openCount={props.model.openCount}')
  // Alle Bereiche fehlen -> drei echte offene Punkte (kein „alles ok").
  const missing = buildOverviewModel({ config: null, system: null, watcher: null, errors: [] })
  expect(missing.openCount).toBe(3)
  // Alles verbunden und ohne Warnungen -> Stempel „ALLES IN ORDNUNG".
  const ready = buildOverviewModel({ config: readyConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(ready.openCount).toBe(0)
  // Ein echter Konflikt (kein Coverage-Info-Eintrag) -> genau ein offener Punkt.
  const conflict = buildOverviewModel({ config: conflictConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(conflict.openCount).toBe(1)
})

// --- D2: Readiness als Registerzeilen ----------------------------------------

test('readiness rows map the three core areas to dot, name and short state', () => {
  const model = buildOverviewModel({ config: conflictConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(model.readiness).toEqual([
    { id: 'config', tone: 'warning', name: 'Einstellungen und lokale Quellen', state: '1 Hinweise offen' },
    { id: 'system', tone: 'ready', name: 'Systemprüfung', state: 'Bereit' },
    { id: 'watcher', tone: 'ready', name: 'Wartung und Updates', state: 'Bereit' }
  ])
  const missing = buildOverviewModel({ config: null, system: null, watcher: null, errors: [] })
  expect(missing.readiness.every((row) => row.tone === 'incomplete' && row.state === 'Noch nicht verbunden')).toBe(true)
  expect(overviewSection).toContain('<ReadinessRows rows={props.readiness} />')
  expect(overviewSection).toContain('<span className={\'ov-dot \' + readinessDotTone(row.tone)} aria-hidden="true" />')
})

// --- D3: Zeilen-Grundmuster in den drei Listen --------------------------------

test('diagnosis findings render as register rows with toggle, action and chevron', () => {
  expect(diagnosisCards).toContain('ov-reg ov-diagnostics-rows')
  expect(diagnosisCards).toContain('className="ov-diag-toggle"')
  expect(diagnosisCards).toContain('aria-expanded={props.expanded}')
  expect(diagnosisCards).toContain("aria-label={msg('diagnostics.row.toggle')}")
  expect(diagnosisCards).toContain('ov-diag-chevron')
  // Keine Tint-Karten mehr.
  expect(diagnosisCards).not.toContain('ov-diagnostics-grid')
  expect(diagnosisCards).not.toContain('ov-diagnosis-icon')
  expect(diagnosisCss).not.toContain('.ov-diagnostics-grid')
  // Tastaturbedienbar: jedes onClick haengt an einem nativen Button.
  const onClicks = diagnosisCards.match(/onClick=/g) ?? []
  const buttons = diagnosisCards.match(/<button\s+type="button"/g) ?? []
  expect(onClicks.length).toBe(buttons.length)
  expect(diagnosisCards).not.toMatch(/<(div|span|a|li)[^>]*onClick/)
})

test('coverage rows carry a status dot and a short line, filters stay untouched', () => {
  expect(coverageRegister).toContain("<span className={'ov-dot ' + coverageDotTone(entry)} aria-hidden=\"true\" />")
  expect(coverageRegister).toContain('ov-coverage-sub')
  expect(coverageRegister).toContain("entry.conflictReason ?? entry.desc")
  // Filter/Deckelung unveraendert (D3.2).
  expect(coverageRegister).toContain('filterCoverageRows')
  expect(coverageRegister).toContain('const PAGE_SIZE = 8')
})

test('area navigation renders as register rows, not cards', () => {
  expect(taskCard).toContain('<span className="ov-dot idle" aria-hidden="true" />')
  expect(taskCard).toContain('<span className="ov-task-state">')
  expect(overviewSection).toContain('<section className="ov-tasks ov-reg">')
  expect(overviewCss).not.toContain('.ov-task-icon')
  // Register-Container: 1px-Linie, kein Schatten (lines-Achse).
  const regBlock = overviewCss.slice(overviewCss.indexOf('.ov-reg {'), overviewCss.indexOf('.ov-reg > * + *'))
  expect(regBlock).toContain('border: var(--card-border)')
  expect(regBlock).not.toContain('box-shadow')
})

// --- Fixtures ------------------------------------------------------------------

function readyConfig(): AppData {
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: { claude: family([entry('skill-a', 'active')]) }
  }
}

function conflictConfig(): AppData {
  return {
    snapshot: { frozen: false, date: '', label: 'test' },
    machines: [],
    llms: [],
    data: { claude: family([entry('server', 'conflict')]) }
  }
}

function family(entries: ConfigEntry[]): LlmConfig {
  return {
    categories: [{ id: 'plugins', label: 'Plugins', icon: 'plug', path: '', blurb: '', entries }],
    duplicates: []
  }
}

function entry(id: string, status: 'active' | 'conflict'): ConfigEntry {
  return { id, name: id, status, scope: 'global' as const, path: '', desc: '', updated: '' }
}

function readySystem(): System {
  return {
    updated: '',
    areas: [{ id: 'runtime', label: 'Runtime', icon: '', blurb: '', entries: [{ name: 'Node', status: 'active', desc: '' }] }]
  }
}

function readyWatcher(): Watcher {
  return {
    daemon: { status: 'running', lastResult: '', schedule: '', tokens: '', sources: 1, updated: '', note: '' },
    tiers: [],
    sources: [{ name: 'Codex', kind: '', current: '', latest: '', tier: 1, state: 'current' }],
    changelogs: []
  }
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
