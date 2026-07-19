import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMessageKey } from '../../shared/messages'
import {
  filterSectionsForMode,
  isExpertOnlySection,
  sectionVisibleForMode
} from '../../src/renderer/chrome/nav-visibility'
import type { Section } from '../../src/renderer/state/types'

// Teil E (Owner-Entscheid D1/D2, 2026-07-18): Navigations-Weiche je DisplayMode.
// Verhaltenstests laufen gegen die zentrale Weiche (chrome/nav-visibility.ts);
// die Verdrahtung in LlmBar/App/Settings/TopBar wird per Source-Pin gesichert
// (tests/write hat bewusst kein Browser-Setup — Muster: display-mode.spec.ts).

const llmBar = read('src/renderer/chrome/LlmBar.tsx')
const app = read('src/renderer/App.tsx')
const settingsSection = read('src/renderer/sections/settings/SettingsSection.tsx')
const topBar = read('src/renderer/chrome/TopBar.tsx')
const modeSwitch = read('src/renderer/components/DisplayModeSwitch.tsx')
const modeControl = read('src/renderer/sections/settings/DisplayModeControl.tsx')
const workbenchShell = read('src/renderer/styles/workbench-shell.css')
const overviewCss = read('src/renderer/sections/overview/OverviewSection.css')
const overviewSection = read('src/renderer/sections/overview/OverviewSection.tsx')
const diagnosisCards = read('src/renderer/sections/overview/DiagnosisCards.tsx')
const settingsActions = read('src/renderer/sections/settings/SettingsActionsPanel.tsx')
const sectionVisibility = read('src/renderer/state/section-visibility.ts')
const navVisibility = read('src/renderer/chrome/nav-visibility.ts')

// D5: Hauptnav = fuenf benannte Bereiche (Einstellungen statt Hilfe als fuenfter
// Eintrag); Hilfe + Experten-Bereiche liegen beschriftet im „Mehr"-Menue.
const TASK_IDS: ReadonlyArray<Section> = ['overview', 'updates', 'config', 'archiv', 'settings']
const EXPERT_IDS: ReadonlyArray<Section> = ['baum', 'graph', 'system', 'struktur']
const ALL_SECTIONS: ReadonlyArray<Section> = [...TASK_IDS, ...EXPERT_IDS, 'referenz', 'prefs', 'quellen']

test('simple mode shows the five named main areas plus help, hiding baum/graph/system/struktur', () => {
  for (const id of TASK_IDS) expect(sectionVisibleForMode(id, 'simple')).toBe(true)
  expect(sectionVisibleForMode('referenz', 'simple')).toBe(true)
  for (const id of EXPERT_IDS) {
    expect(isExpertOnlySection(id)).toBe(true)
    expect(sectionVisibleForMode(id, 'simple')).toBe(false)
  }
  expect(isExpertOnlySection('settings')).toBe(false)

  const menu = filterSectionsForMode(menuItems(), 'simple').map((item) => item.id)
  expect(menu).toEqual(['referenz'])
})

test('expert mode keeps every navigation entry visible', () => {
  for (const id of ALL_SECTIONS) expect(sectionVisibleForMode(id, 'expert')).toBe(true)

  const items = menuItems()
  expect(filterSectionsForMode(items, 'expert')).toBe(items)
  expect(filterSectionsForMode(items, 'expert').map((item) => item.id)).toEqual([
    'referenz',
    'baum',
    'graph',
    'system',
    'struktur'
  ])
})

test('llm bar feeds menu sections through the mode gate while task sections stay unfiltered', () => {
  expect(llmBar).toContain('const menuSections = filterSectionsForMode(MENU_SECTIONS, ui.displayMode)')
  expect(llmBar).toContain('{TASK_SECTIONS.map((s) => (')
  expect(llmBar).toContain('{[...TASK_SECTIONS.slice(3), ...menuSections].map((s) => (')
  // TASK_SECTIONS enthaelt genau die fuenf benannten Hauptbereiche (D5).
  const taskBlock = llmBar.slice(llmBar.indexOf('const TASK_SECTIONS'), llmBar.indexOf('const MENU_SECTIONS'))
  for (const id of TASK_IDS) expect(taskBlock).toContain(`id: '${id}'`)
  // MENU_SECTIONS enthaelt Hilfe plus die vier Experten-Bereiche.
  const menuBlock = llmBar.slice(llmBar.indexOf('const MENU_SECTIONS'), llmBar.indexOf('function alertCount'))
  for (const id of ['referenz', ...EXPERT_IDS]) expect(menuBlock).toContain(`id: '${id}'`)
})

test('d5: every nav entry renders a visible label — no icon-only button without text', () => {
  // Kein compact-Rendering mehr: SectionButton zeigt das Label unbedingt.
  expect(llmBar).not.toContain('compact')
  expect(llmBar).not.toContain('(!compact || menuItem) && label')
  expect(llmBar).toContain('{label}')
  // Jeder Nav-Eintrag in beiden Listen hat einen Katalog-Label-Key.
  const navBlocks = llmBar.slice(llmBar.indexOf('const TASK_SECTIONS'), llmBar.indexOf('function alertCount'))
  const entries = navBlocks.match(/\{ id: '[^']+'[^\n]*\}/g) ?? []
  expect(entries.length).toBe(10)
  for (const entry of entries) expect(entry).toContain("labelKey: '")
  // „Mehr"-Button und Overflow tragen Katalog-Labels statt Inline-Literalen.
  expect(llmBar).toContain("msgText('chrome.nav.more')")
  expect(llmBar).not.toContain('<span>Mehr</span>')
  for (const key of ['chrome.nav.more', 'chrome.nav.moreOpen', 'chrome.nav.moreClose', 'chrome.nav.overflowLabel']) {
    expect(isMessageKey(key)).toBe(true)
  }
  // Aktive-Markierung und Menue-ARIA bleiben unveraendert verdrahtet.
  expect(llmBar).toContain("'sec-btn' + (active === item.id ? ' on' : '')")
  expect(llmBar).toContain('aria-haspopup="menu"')
  expect(llmBar).toContain('aria-expanded={open}')
})

test('simple mode falls back to overview when ui.section is an expert-only area', () => {
  expect(app).toContain("sectionVisibleForMode(ui.section, ui.displayMode) ? ui.section : 'overview'")
  // Guard sitzt an der Section-Weiche: Body und Chrome nutzen die aufgeloeste Sektion.
  expect(app).toContain('<SectionBody section={section}')
  expect(app).toContain("{section !== 'overview' && <TopBar />}")
  // Kein State-Eingriff: der Guard ruft kein setSection auf.
  expect(app).not.toContain('actions.setSection(')
})

test('settings section shows only the prefs tab in simple mode and all tabs in expert mode', () => {
  expect(settingsSection).toContain("const expert = ui.displayMode === 'expert'")
  expect(settingsSection).toContain("const activeTab: SettingsTab = expert ? tab : 'tweaks'")
  expect(settingsSection).toContain('{expert && <SettingsTabs tab={activeTab} onTab={setTab} />}')
  // Die vier Tabs bleiben im Expert-Modus unveraendert verdrahtet.
  for (const tab of ['tweaks', 'updates', 'sources', 'modules']) {
    expect(settingsSection).toContain(`{ id: '${tab}',`)
  }
})

test('top bar anchors the mode switch wired to the store display mode', () => {
  // Teilplan F: die Verdrahtung laeuft ueber useDisplayModeSwitch (optimistisch
  // + Transition) — der Switch bleibt kontrolliert am Store-Modus.
  expect(topBar).toContain('useDisplayModeSwitch(')
  expect(topBar).toContain('<DisplayModeSwitch active={active} onSelect={onSelect} />')
  expect(topBar).toContain('<TopBarModeSwitch />')
  // Gemeinsamer Kern statt Duplikat: Settings-Control und TopBar nutzen denselben Switch.
  expect(modeControl).toContain('<DisplayModeSwitch active={active} onSelect={onSelect} />')
  expect(modeSwitch).toContain('<DisplayModeButton mode="simple"')
  expect(modeSwitch).toContain('<DisplayModeButton mode="expert"')
  expect(modeSwitch).toContain('aria-pressed={props.active === props.mode}')
})

test('review fixes e-wp1: switch visibility, safe routing, settings gating', () => {
  // Fix 1: Modus-Umschalter bleibt in TopBar und OverviewHead auch schmal sichtbar.
  expect(workbenchShell).toContain('.top .display-mode-switch > .sec-btn.compact { display: inline-flex; }')
  expect(workbenchShell).toContain('.top .section-switch.display-mode-switch > .sec-btn { display: inline-flex; }')
  expect(overviewCss).toContain('.ov-head .section-switch.display-mode-switch > .sec-btn { display: inline-flex; }')
  const ovHead900 = overviewCss.slice(overviewCss.indexOf('@media (max-width: 900px)'))
  expect(ovHead900).toContain('flex-wrap: wrap')
  // Fix 2: Diagnose-/NextAction-Buttons routen modus-sicher (kein toter Guard-Button).
  expect(overviewSection).toContain('sectionVisibleForMode(card.diagnosisAction.route')
  expect(overviewSection).toContain('onOpenExpert')
  expect(diagnosisCards).toContain('isExpertOnlySection(props.card.diagnosisAction.route)')
  expect(diagnosisCards).toContain('diagnostics.card.openInExpert')
  // Fix 3: Backup/Export/Import-Karte nur im Expert-Modus (Teilplan F: selber
  // Modus-Wert, jetzt als Hook-Alias `displayMode` aus useDisplayModeSwitch).
  expect(settingsActions).toContain('useDisplayModeSwitch(')
  expect(settingsActions).toContain("displayMode === 'expert'")
  // Fix 4/5: konsistente aktive Pill und gruppenbeschrifteter Umschalter.
  expect(llmBar).toContain('activeSection')
  expect(modeSwitch).toContain('role="group"')
  expect(modeSwitch).toContain('simpleMode.switchGroup')
  // Fix 2a/2b: die Weiche lebt in state/, chrome re-exportiert sie unveraendert.
  expect(sectionVisibility).toContain('export function isExpertOnlySection')
  expect(navVisibility).toContain("export { isExpertOnlySection, sectionVisibleForMode } from '../state/section-visibility'")
})

function menuItems(): ReadonlyArray<{ id: Section }> {
  return [{ id: 'referenz' }, { id: 'baum' }, { id: 'graph' }, { id: 'system' }, { id: 'struktur' }]
}

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
