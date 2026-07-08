import { test, expect } from '@playwright/test'
import {
  deMessages,
  enMessages,
  getLocale,
  MESSAGE_KEYS,
  MESSAGE_PARAM_NAMES,
  msg,
  setLocale
} from '../../shared/messages'

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort()
}

test('de catalog contains exactly the typed message keys', () => {
  expect(Object.keys(deMessages).sort()).toEqual([...MESSAGE_KEYS].sort())
})

test('en catalog contains exactly the typed message keys', () => {
  expect(Object.keys(enMessages).sort()).toEqual([...MESSAGE_KEYS].sort())
})

test('catalog placeholders match typed params', () => {
  for (const key of MESSAGE_KEYS) {
    expect(placeholders(deMessages[key]).sort()).toEqual([...MESSAGE_PARAM_NAMES[key]].sort())
    expect(placeholders(enMessages[key]).sort()).toEqual([...MESSAGE_PARAM_NAMES[key]].sort())
  }
})

test('msg replaces named placeholders without string concatenation', () => {
  expect(msg('update.versionPrefix', { sourceLabel: 'GitHub Release' })).toBe(
    'GitHub Release · Version'
  )
  expect(msg('update.dialog.downloadDetail', { version: 'v0.1.3' })).toBe(
    'Version v0.1.3 wird in den lokalen Temp-Ordner kopiert. Vor dem Kopieren wird ein Pre-Snapshot angelegt.'
  )
  expect(msg('update.progressBytes', {
    copied: '10 MB',
    total: '100 MB',
    percentage: '10'
  })).toBe('10 MB / 100 MB (10 %)')
  expect(msg('update.watcher.subtitle', {
    sourceCount: '12',
    tokens: '42k',
    updated: 'heute'
  })).toBe('Monitoring-Daemon · 12 Quellen · 42k · Stand heute')
  expect(msg('update.watcher.tierBadge', { tier: '2' })).toBe('Stufe 2')
  expect(msg('update.watcher.lastResult', { lastResult: 'ok' })).toBe('LastResult ok')
  expect(msg('overview.readySummary', { readyCount: '3', totalCount: '5' })).toBe(
    '3 von 5 Bereichen sind bereit.'
  )
  expect(msg('overview.warningSummary.many', { topicCount: '4' })).toBe(
    '4 Themen brauchen Aufmerksamkeit.'
  )
  expect(msg('overview.status.partial', { readyCount: '1', totalCount: '3' })).toBe(
    'Teilweise bereit: 1 von 3 Grundbereichen sind bereit.'
  )
  expect(msg('overview.metric.openTopics.some', { topics: 'Wartung und Updates' })).toBe(
    'Offene Themen: Wartung und Updates.'
  )
  expect(msg('diagnostics.card.nextStep', { action: 'Ordner wählen' })).toBe(
    'Sicherer nächster Schritt: Ordner wählen'
  )
  expect(msg('diagnostics.panel.more', { hiddenCount: '7' })).toBe(
    '7 weitere Hinweise sind in der Detailprüfung sichtbar.'
  )
  expect(msg('expertDetails.primaryTerm', { term: 'Einstellung ändern' })).toBe(
    'Alltagssprache: Einstellung ändern'
  )
  expect(msg('expertDetails.meaning', { meaning: 'Vor dem Schreiben prüfen' })).toBe(
    'Bedeutung: Vor dem Schreiben prüfen'
  )
  expect(msg('expertDetails.rawTarget', { target: 'config' })).toBe(
    'Technisches Ziel: config'
  )
  expect(msg('guidedFlows.stepCount', { current: '2', total: '4' })).toBe('Schritt 2 von 4')
})

test('no-param messages are returned unchanged', () => {
  const key: MessageKey = 'update.retryCheck'
  expect(msg(key)).toBe('Erneut prüfen')
  expect(msg('settings.tab.tweaks')).toBe('Darstellung')
  expect(msg('settings.tab.updates')).toBe('Updates')
  expect(msg('settings.tab.sources')).toBe('Ordner')
  expect(msg('settings.tab.modules')).toBe('Module')
  expect(msg('chrome.action.backupImportTitle')).toBe('Sichern und wieder einlesen')
  expect(msg('chrome.action.export')).toBe('JSON exportieren')
  expect(msg('chrome.action.exportTitle')).toBe('Export speichert eine JSON-Datei mit dem aktuellen Config-Überblick.')
  expect(msg('chrome.action.conflicts')).toBe('Konflikte als JSON exportieren')
  expect(msg('chrome.action.conflictsTitle')).toBe('Nur Konflikte als JSON exportieren')
  expect(msg('chrome.action.import')).toBe('Datei importieren')
  expect(msg('chrome.action.importTitle')).toBe('Import liest RaWaLLMConfig-JSON oder einzelne Markdown-Dateien. Vor dem Schreiben wählst du den Zielordner.')
  expect(msg('settings.reopenOnboarding')).toBe('Einrichtung erneut öffnen')
  expect(msg('onboarding.modelDiscovery.title')).toBe('Erkannte Modelle')
  expect(msg('onboarding.modelDiscovery.empty')).toBe('Keine lokalen Modelle gefunden. Wähle den Modellordner auf deiner Festplatte oder starte einen lokalen Modellserver.')
  expect(msg('onboarding.modelDiscovery.chooseFolder')).toBe('Modellordner wählen')
  expect(msg('integrations.title')).toBe('Module')
  expect(msg('integrations.aria.modules')).toBe('Module')
  expect(msg('integrations.module.core')).toBe('Grundfunktionen')
  expect(msg('integrations.module.userSources')).toBe('Eigene Ordner')
  expect(msg('integrations.module.sharedTrunk')).toBe('Gemeinsame Regeln')
  expect(msg('integrations.module.workspaceRegistry')).toBe('Arbeitsbereiche')
  expect(msg('integrations.module.graphify')).toBe('Wissensnetz')
  expect(msg('integrations.module.obsidian')).toBe('Notizen')
  expect(msg('integrations.module.watcherGovernance')).toBe('Wartung & Hinweise')
  expect(msg('integrations.status.notConfigured')).toBe('Nicht eingerichtet')
  expect(msg('integrations.status.found')).toBe('Gefunden')
  expect(msg('integrations.status.active')).toBe('Aktiv')
  expect(msg('integrations.status.paused')).toBe('Pausiert')
  expect(msg('integrations.status.unavailable')).toBe('Nicht verfuegbar')
  expect(msg('integrations.action.activate')).toBe('Aktivieren')
  expect(msg('integrations.action.pause')).toBe('Pausieren')
  expect(msg('integrations.action.chooseFolder')).toBe('Ordner waehlen…')
  expect(msg('update.toast.bridgeUnavailable')).toBe('Bridge nicht verfügbar')
  expect(msg('update.toast.checkComplete')).toBe('Prüfen abgeschlossen')
  expect(msg('update.toast.noUpdateAvailable')).toBe('Kein Update verfügbar')
  expect(msg('update.toast.downloaded')).toBe('Update heruntergeladen')
  expect(msg('update.toast.installStarted')).toBe('Installation gestartet')
  expect(msg('update.toast.actionFailed')).toBe('Aktion fehlgeschlagen')
  expect(msg('update.toast.bridgeError')).toBe('Bridge-Fehler')
  expect(msg('update.watcher.title')).toBe('Toolchain-Watcher')
  expect(msg('update.watcher.fulltext')).toBe('Volltext')
  expect(msg('update.watcher.daemonSchedule')).toBe('Daemon-Schedule')
  expect(msg('overview.title')).toBe('Überblick')
  expect(msg('tasks.setup.title')).toBe('Einrichten')
  expect(msg('tasks.setup.body')).toBe('Fehlende Ordner, Modelle oder Bausteine verbinden.')
  expect(msg('tasks.setup.term')).toBe('Start einrichten')
  expect(msg('tasks.check.meaning')).toBe(
    'Du siehst, ob Quellen erreichbar sind und ob Wartungshinweise offen sind.'
  )
  expect(msg('tasks.change.body')).toBe('Einstellungsdatei oder Config-Eintrag mit Vorschau ändern.')
  expect(msg('tasks.change.meaning')).toBe(
    'Du prüfst Vorschau und betroffene Datei, bevor mit Sicherung gespeichert wird.'
  )
  expect(msg('simpleMode.backupHint')).toBe('Du speicherst erst, nachdem eine Sicherung angelegt wurde.')
  expect(msg('tasks.expert.body')).toBe('PC-Zustand, lokale Quellen, Regeln und technische Landkarte ansehen.')
  expect(msg('help.nav.title')).toBe('Hilfe')
  expect(msg('help.mode.simple')).toContain('Alltagssprache')
  expect(msg('simpleMode.showDetails')).toBe('Details anzeigen')
  expect(msg('expertDetails.rawDetails')).toBe('Rohdaten und technische Details')
  expect(msg('diagnostics.status.problemFound')).toBe('Fehler gefunden')
  expect(msg('guidedFlows.activateModule.title')).toBe('Modul aktivieren')
})

test('locale can be switched at runtime', () => {
  const previous = getLocale()
  setLocale('en')
  expect(msg('settings.language.label')).toBe('App language')
  expect(msg('tasks.change.meaning')).toBe('You review the preview and affected file before saving with a backup.')
  setLocale(previous)
})

test('NUX params are typed and mirrored in both locales', () => {
  expect(MESSAGE_PARAM_NAMES['overview.readySummary']).toEqual(['readyCount', 'totalCount'])
  expect(MESSAGE_PARAM_NAMES['overview.warningSummary']).toEqual(['warningCount'])
  expect(MESSAGE_PARAM_NAMES['overview.warningSummary.one']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['overview.warningSummary.many']).toEqual(['topicCount'])
  expect(MESSAGE_PARAM_NAMES['overview.status.partial']).toEqual(['readyCount', 'totalCount'])
  expect(MESSAGE_PARAM_NAMES['overview.metric.openTopics.some']).toEqual(['topics'])
  expect(MESSAGE_PARAM_NAMES['overview.metric.setup.needed']).toEqual(['count', 'total'])
  expect(MESSAGE_PARAM_NAMES['tasks.card.status']).toEqual(['status'])
  expect(MESSAGE_PARAM_NAMES['expertDetails.primaryTerm']).toEqual(['term'])
  expect(MESSAGE_PARAM_NAMES['expertDetails.meaning']).toEqual(['meaning'])
  expect(MESSAGE_PARAM_NAMES['expertDetails.technicalName']).toEqual(['term'])
  expect(MESSAGE_PARAM_NAMES['expertDetails.rawTarget']).toEqual(['target'])
  expect(MESSAGE_PARAM_NAMES['diagnostics.card.meaning']).toEqual(['issue'])
  expect(MESSAGE_PARAM_NAMES['diagnostics.card.nextStep']).toEqual(['action'])
  expect(MESSAGE_PARAM_NAMES['diagnostics.panel.more']).toEqual(['hiddenCount'])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.backToDetails']).toEqual(['target'])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.symptomTitle']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['guidedFlows.stepCount']).toEqual(['current', 'total'])
})
