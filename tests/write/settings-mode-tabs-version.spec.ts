import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMessageKey } from '../../shared/messages'
import { deCoreMessages } from '../../shared/messages/de-core'
import { enCoreMessages } from '../../shared/messages/en-core'
import { actionVisibleForMode } from '../../src/renderer/state/section-visibility'

// WP-F6 (2026-08-07): App-Version sichtbar + Updates-/Grundeinstellungs-Tab in
// beiden Modi. Verhaltenstests laufen gegen die zentrale Modus-Weiche
// (state/section-visibility.ts); die Verdrahtung in SettingsSection und
// DisplayModeCard wird per Source-Pin gesichert (tests/write hat bewusst
// kein Browser-Setup — Muster: nav-visibility-teil-e.spec.ts).
// 2026-08-11: das frühere SettingsActionsPanel ist aufgelöst — die
// Modus-/Version-Karte liegt in DisplayModeCard.tsx (Tab „Darstellung").

const settingsSection = read('src/renderer/sections/settings/SettingsSection.tsx')
const displayModeCard = read('src/renderer/sections/settings/DisplayModeCard.tsx')
const settingsCss = read('src/renderer/sections/settings/SettingsSection.css')

test('diagnose-fokus settings-tab-updates loest im simple-modus auf, sources/modules nicht', () => {
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-updates' }, 'simple')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-updates' }, 'expert')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-sources' }, 'simple')).toBe(false)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-modules' }, 'simple')).toBe(false)
})

test('grundeinstellungen (tweaks) und updates belegen beide modi, files/sources/modules bleiben experte', () => {
  expect(settingsSection).toContain("{ id: 'tweaks', labelKey: 'settings.tab.tweaks', icon: 'edit', simple: true }")
  expect(settingsSection).toContain("{ id: 'files', labelKey: 'settings.tab.files', icon: 'save', simple: false }")
  expect(settingsSection).toContain("{ id: 'updates', labelKey: 'settings.tab.updates', icon: 'up', simple: true }")
  expect(settingsSection).toContain("{ id: 'sources', labelKey: 'settings.tab.sources', icon: 'folder', simple: false }")
  expect(settingsSection).toContain("{ id: 'modules', labelKey: 'settings.tab.modules', icon: 'plug', simple: false }")
  // Tab-Leiste rendert in beiden Modi mit der modusgefilterten Liste; ein im
  // Simple-Modus unsichtbarer Tab faellt sicher auf tweaks zurueck.
  expect(settingsSection).toContain('const visibleTabs = expert ? TABS : TABS.filter((t) => t.simple)')
  expect(settingsSection).toContain("const activeTab: SettingsTab = visibleTabs.some((t) => t.id === tab) ? tab : 'tweaks'")
  expect(settingsSection).toContain('<SettingsTabs tabs={visibleTabs} tab={activeTab} onTab={setTab} />')
  // Diagnose-Fokus auf den Updates-Tab bleibt als Startziel verdrahtet.
  expect(settingsSection).toContain("if (focusId === 'settings-tab-updates') return 'updates'")
})

test('app-version erscheint als fusszeile der modus-karte in beiden modi', () => {
  // Die Fusszeile haengt in der Modus-Karte des Darstellung-Tabs (in beiden
  // Modi sichtbar, kein Expert-Gate) und speist sich aus dem Update-Kanal
  // (updatesGetState -> currentVersion = app.getVersion() im Main).
  expect(displayModeCard).toContain('<AppVersionFooter />')
  expect(displayModeCard).toContain("hasUpdateBridge('updatesGetState')")
  expect(displayModeCard).toContain('readUpdateState()')
  expect(displayModeCard).toContain("msg('settings.appVersion', { version })")
  // Kein Modus-Gate um die Karte: Schalter und Version bleiben immer sichtbar.
  expect(displayModeCard).not.toContain("displayMode === 'expert' && (")
  expect(settingsCss).toContain('.settings-action-card p.settings-app-version')
})

test('message-key settings.appVersion existiert in beiden sprachen mit version-parameter', () => {
  expect(isMessageKey('settings.appVersion')).toBe(true)
  expect(deCoreMessages['settings.appVersion']).toBe('App-Version {version}')
  expect(enCoreMessages['settings.appVersion']).toBe('App version {version}')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
