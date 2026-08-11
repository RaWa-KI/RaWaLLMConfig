import { test, expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMessageKey } from '../../shared/messages'
import { deCoreMessages } from '../../shared/messages/de-core'
import { enCoreMessages } from '../../shared/messages/en-core'
import { actionVisibleForMode } from '../../src/renderer/state/section-visibility'

// Owner-Befund 2026-08-11 (Einstellungen-Seite 0.1.10): das SettingsActionsPanel
// rendert unbedingt über JEDEM Tab — dieselbe „Darstellung"-Karte plus „Sichern
// und wieder einlesen" auf jeder Unterseite, der Erklärblock „Rohdaten und
// technische Details" doppelt. Umbau: Modus-Schalter + App-Version in den
// Darstellung-Tab, Export/Import in den neuen Experten-Tab „Dateien".
// tests/write hat bewusst kein Browser-Setup — Zusicherungen laufen wie in
// nav-visibility-teil-e.spec.ts über Modul-/Source-Pins plus die zentrale
// Modus-Weiche. Das sichtbare Verhalten deckt zusätzlich der UI-Smoke ab.

const settingsSection = read('src/renderer/sections/settings/SettingsSection.tsx')
const filesPanel = read('src/renderer/sections/settings/FilesPanel.tsx')
const displayModeCard = read('src/renderer/sections/settings/DisplayModeCard.tsx')
const displayModeControl = read('src/renderer/sections/settings/DisplayModeControl.tsx')
const prefsSection = read('src/renderer/sections/prefs/PrefsSection.tsx')

test('das SettingsActionsPanel existiert nicht mehr und wird nirgends importiert', () => {
  expect(existsSync(abs('src/renderer/sections/settings/SettingsActionsPanel.tsx'))).toBe(false)
  expect(settingsSection).not.toContain('SettingsActionsPanel')
  // Kein Dauerblock mehr vor der Tab-Weiche: jeder Inhalt haengt an genau einem Tab.
  const body = settingsSection.slice(settingsSection.indexOf('<FocusNotice section="settings" />'))
  const unconditional = body.match(/^ {6}<[A-Z][A-Za-z]*\s*\/>$/gm) ?? []
  expect(unconditional, 'kein tabunabhaengiger Block zwischen FocusNotice und Tab-Inhalten').toEqual([])
})

test('tab „Dateien" ist ein Experten-Bereich und traegt Export, Konflikte und Import', () => {
  expect(settingsSection).toContain("{ id: 'files', labelKey: 'settings.tab.files', icon: 'save', simple: false }")
  expect(settingsSection).toContain("{activeTab === 'files' && <FilesPanel />}")
  // Modus-Weiche: im Simple-Modus faellt der Tab aus visibleTabs heraus.
  expect(settingsSection).toContain('const visibleTabs = expert ? TABS : TABS.filter((t) => t.simple)')
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-files' }, 'simple')).toBe(false)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-files' }, 'expert')).toBe(true)
  // Fachinhalt vollstaendig uebernommen (Export, Konflikt-Export, Import + Zieldialog).
  expect(filesPanel).toContain('exportBundle(bundle)')
  expect(filesPanel).toContain('exportConflictBundle(bundle)')
  expect(filesPanel).toContain('<ImportTargetDialog')
  expect(filesPanel).toContain('parseImportSource(file, knownRoots)')
  expect(filesPanel).toContain('applyImportItems(built)')
})

test('fokus-routing kennt settings-tab-files, bestehende ziele bleiben unveraendert', () => {
  expect(settingsSection).toContain("if (focusId === 'settings-tab-files') return 'files'")
  expect(settingsSection).toContain("if (focusId === 'settings-tab-sources') return 'sources'")
  expect(settingsSection).toContain("if (focusId === 'settings-tab-modules') return 'modules'")
  expect(settingsSection).toContain("if (focusId === 'settings-tab-updates') return 'updates'")
  expect(settingsSection).toContain("return focusTab(readOverviewFocus('settings')?.focusId) ?? 'tweaks'")
})

test('darstellung-tab zeigt schalter und experten-bulletliste genau einmal', () => {
  // Der Schalter haengt genau einmal im Tab — ueber die DisplayModeCard.
  expect(prefsSection).toContain('<DisplayModeCard />')
  expect(displayModeCard).toContain('<DisplayModeControl active={displayMode} onSelect={onDisplayMode} />')
  expect(occurrences(prefsSection, '<DisplayModeCard />')).toBe(1)
  // Die Bulletliste kommt nur noch aus DisplayModeControl (Experten-Modus).
  expect(displayModeControl).toContain("active === 'expert' && <ExpertModeDetails />")
  expect(occurrences(displayModeControl, 'settingsExpertList()')).toBe(1)
  // Die frueher zusaetzliche Karte „Rohdaten und technische Details" ist weg.
  expect(prefsSection).not.toContain('settingsExpertList')
  expect(prefsSection).not.toContain('SettingsExpertCard')
  expect(prefsSection).not.toContain("msg('expertDetails.rawDetails')")
})

test('message-key settings.tab.files ist in beiden sprachen registriert', () => {
  expect(isMessageKey('settings.tab.files')).toBe(true)
  expect(deCoreMessages['settings.tab.files']).toBe('Dateien')
  expect(enCoreMessages['settings.tab.files']).toBe('Files')
})

test('flex-gate: tab-inhalte stapeln fluid mit rem-abstand statt fester breite', () => {
  const settingsCss = read('src/renderer/sections/settings/SettingsSection.css')
  const prefsCss = read('src/renderer/sections/prefs/PrefsSection.css')
  for (const [name, css, selector] of [
    ['settings', settingsCss, '.settings-files'],
    ['prefs', prefsCss, '.prefs-main']
  ] as const) {
    const block = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)))
    expect(block, `${name}: Flex-Spalte`).toContain('flex-direction: column')
    expect(block, `${name}: rem-Abstand statt aneinanderklebender Karten`).toContain('gap: 1rem')
    expect(block, `${name}: fluide Breite`).toContain('width: 100%')
  }
  // Karten begrenzen nur per max-width; keine feste px-Layoutbreite. Geprueft
  // wird je Layout-Container (Icons/Buttons duerfen weiter feste px tragen).
  for (const [css, selector] of [
    [settingsCss, '.settings-files'],
    [settingsCss, '.settings-action-card {'],
    [prefsCss, '.prefs-main'],
    [prefsCss, '.prefs-card {']
  ] as const) {
    const block = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)))
    expect(block, `${selector}: fluide Breite ohne feste px`).not.toMatch(/\bwidth:\s*\d+px/)
  }
  expect(settingsCss).toContain('max-width: 68rem')
  expect(prefsCss).toContain('max-width: 68rem')
  // Schmale Viewport-Klasse bleibt in beiden Stylesheets bedient.
  expect(settingsCss).toContain('@media (max-width: 560px)')
  expect(prefsCss).toContain('@media (max-width: 560px)')
})

function occurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

function abs(path: string): string {
  return resolve(process.cwd(), path)
}

function read(path: string): string {
  return readFileSync(abs(path), 'utf8')
}
