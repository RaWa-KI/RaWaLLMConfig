import { test, expect } from '@playwright/test'
import {
  languagePackHint,
  moduleDescription,
  prefsStoreHint,
  settingsExpertList,
  watcherHelp
} from '../../shared/messages/ux-copy'

test('module descriptions differ between simple and expert wording', () => {
  expect(moduleDescription('shared-trunk', 'simple')).toContain('Gemeinsame Regeln')
  expect(moduleDescription('shared-trunk', 'expert')).toContain('.shared/.claude')
  expect(moduleDescription('graphify', 'simple')).not.toEqual(moduleDescription('graphify', 'expert'))
})

test('settings helper copy names local file fallback and language pack state', () => {
  expect(prefsStoreHint().body).toContain('Datenbank')
  expect(prefsStoreHint().body).toContain('lokal gelesen und gespeichert')
  expect(prefsStoreHint().action).toContain('weiterarbeiten')
  expect(prefsStoreHint().title).not.toContain('DB')
  expect(prefsStoreHint().title).not.toContain('Fallback')
  expect(languagePackHint()).toContain('Deutsch und Englisch')
  expect(languagePackHint()).toContain('nicht importiert')
  expect(languagePackHint()).not.toContain('nicht verfügbar')
  expect(settingsExpertList()).toHaveLength(3)
  expect(settingsExpertList('en')[0]).toContain('Technical details')
})

test('watcher helper explains automatic and manual source handling', () => {
  expect(watcherHelp()).toContain('Wartungsprüfung')
  expect(watcherHelp()).toContain('automatisch')
  expect(watcherHelp()).toContain('Neue Werkzeuge')
  expect(watcherHelp('en')).toContain('does not set up new tools')
})
