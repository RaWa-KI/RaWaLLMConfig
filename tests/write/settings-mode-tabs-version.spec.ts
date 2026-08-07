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
// SettingsActionsPanel wird per Source-Pin gesichert (tests/write hat bewusst
// kein Browser-Setup — Muster: nav-visibility-teil-e.spec.ts).

const settingsSection = read('src/renderer/sections/settings/SettingsSection.tsx')
const settingsActions = read('src/renderer/sections/settings/SettingsActionsPanel.tsx')
const settingsCss = read('src/renderer/sections/settings/SettingsSection.css')

test('diagnose-fokus settings-tab-updates loest im simple-modus auf, sources/modules nicht', () => {
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-updates' }, 'simple')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-updates' }, 'expert')).toBe(true)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-sources' }, 'simple')).toBe(false)
  expect(actionVisibleForMode({ route: 'settings', focusId: 'settings-tab-modules' }, 'simple')).toBe(false)
})

test('grundeinstellungen (tweaks) und updates belegen beide modi, sources/modules bleiben experte', () => {
  expect(settingsSection).toContain("{ id: 'tweaks', labelKey: 'settings.tab.tweaks', icon: 'edit', simple: true }")
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

test('app-version erscheint als fusszeile der darstellungs-karte in beiden modi', () => {
  // Die Fusszeile haengt in der immer sichtbaren Darstellungs-Karte (vor dem
  // Expert-Gate der Backup-Karte) und speist sich aus dem Update-Kanal
  // (updatesGetState -> currentVersion = app.getVersion() im Main).
  expect(settingsActions).toContain('<AppVersionFooter />')
  expect(settingsActions).toContain("hasUpdateBridge('updatesGetState')")
  expect(settingsActions).toContain('readUpdateState()')
  expect(settingsActions).toContain("msg('settings.appVersion', { version })")
  const card = settingsActions.slice(
    settingsActions.indexOf("msgText('settings.tab.tweaks')"),
    settingsActions.indexOf("displayMode === 'expert'")
  )
  expect(card).toContain('<AppVersionFooter />')
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
