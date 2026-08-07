// diagnosis-category.spec.ts — WP3 (2026-07-28): dauerhafte Diagnosekarten
// als eigene Sidebar-Kategorie „Diagnose“ OBERHALB der Kategorien (ueber
// „Skills“), mit Anzahl-Badge; im Overview-Kopf bleibt nur eine einzeilige
// Zusammenfassung mit Link. Pinnt Verdrahtung, Guard-Ausnahme und Texte.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import { shouldApplyDefaultCat } from '../../src/renderer/state/default-cat-guard'
import { DIAGNOSIS_CAT_ID } from '../../src/renderer/sections/config/diagnosis-cat'
import { msg } from '../../src/renderer/lib/messages'

const configSection = read('src/renderer/sections/config/ConfigSection.tsx')
const categorySidebar = read('src/renderer/sections/config/CategorySidebar.tsx')
const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const diagnosisView = read('src/renderer/sections/config/DiagnosisView.tsx')

test('WP3: Sidebar zeigt „Diagnose“ mit Anzahl-Badge oberhalb der Kategorie-Gruppen', () => {
  expect(categorySidebar).toContain('DIAGNOSIS_CAT_ID')
  expect(categorySidebar).toContain("msg('diagnostics.nav.label')")
  expect(categorySidebar).toContain('ni-count')
  expect(categorySidebar).toContain('{diagnosisCount}')
  // Der Diagnose-Eintrag steht VOR den Kategorie-Gruppen (oberhalb „Skills“).
  expect(categorySidebar.indexOf('diagnosisCount')).toBeLessThan(categorySidebar.indexOf('groups.map'))
  expect(configSection).toContain('diagnosisCount={diagnosisCount}')
})

test('WP3: ConfigMain rendert die DiagnosisView fuer die Pseudo-Kategorie', () => {
  expect(configSection).toContain("ui.catId === DIAGNOSIS_CAT_ID")
  expect(configSection).toContain('<DiagnosisView')
  expect(diagnosisView).toContain('selectDiagnosisCards')
  expect(diagnosisView).toContain('<DiagnosisCards')
})

test('WP3: Overview traegt nur die einzeilige Zusammenfassung, keinen Kartenblock mehr', () => {
  const content = between(overviewSection, 'function OverviewModeContent', 'function DiagnosisSummary')
  expect(content).not.toContain('<DiagnosisCards')
  expect(content).toContain('<DiagnosisSummary')
  expect(overviewSection).toContain("msg('diagnostics.summary.link', { count: String(count) })")
  expect(overviewSection).toContain('DIAGNOSIS_CAT_ID')
})

test('WP3: Default-Kategorie-Guard akzeptiert „Diagnose“ als stabile Auswahl', () => {
  const cats = [{ id: 'skills', label: 'Skills', icon: '', path: '', blurb: '', entries: [] }]
  expect(shouldApplyDefaultCat(cats, DIAGNOSIS_CAT_ID, null)).toBe(false)
  // Ungueltige/fehlende Auswahl faellt weiter auf die erste Kategorie zurueck.
  expect(shouldApplyDefaultCat(cats, null, null)).toBe(true)
  expect(shouldApplyDefaultCat(cats, 'unbekannt', null)).toBe(true)
})

test('WP3: Laien-Texte sind verdrahtet (de)', () => {
  expect(msg('diagnostics.nav.label')).toBe('Hinweise')
  expect(msg('diagnostics.summary.link', { count: '3' })).toBe('3 Hinweise ansehen')
  expect(msg('diagnostics.summary.link.one')).toBe('1 Hinweis ansehen')
  expect(msg('diagnostics.view.allClear')).toContain('Keine offenen Hinweise')
})

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
