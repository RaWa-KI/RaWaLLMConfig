import type { MessageCatalog } from './types'
import { CHROME_MESSAGE_KEYS } from './message-keys-chrome'

type ChromeMessageKey = (typeof CHROME_MESSAGE_KEYS)[number]

export const deChromeMessages = {
  "chrome.brand.title": "Config",
  "chrome.brand.subtitle": "LLM- & System-Übersicht",
  "chrome.detail.baum": "Baum",
  "chrome.detail.graph": "Graph",
  "chrome.detail.system": "System",
  "chrome.detail.struktur": "Struktur",
  "chrome.detail.prefs": "Einstellungen",
  "chrome.detail.quellen": "Zusätzliche Ordner",
  "chrome.nav.more": "Mehr",
  "chrome.nav.moreOpen": "Weitere Bereiche öffnen",
  "chrome.nav.moreClose": "Bereichsmenü schließen",
  "chrome.nav.overflowLabel": "Weitere Bereiche",
  "chrome.action.export": "JSON exportieren",
  "chrome.action.exportTitle": "Export speichert eine JSON-Datei mit dem aktuellen Config-Überblick.",
  "chrome.action.backupImportTitle": "Sichern und wieder einlesen",
  "chrome.action.conflicts": "Konflikte als JSON exportieren",
  "chrome.action.conflictsTitle": "Nur Konflikte als JSON exportieren",
  "chrome.action.import": "Datei importieren",
  "chrome.action.importTitle": "Import liest RaWaLLMConfig-JSON oder einzelne Markdown-Dateien. Vor dem Schreiben wählst du den Zielordner.",
  "chrome.toast.exportCreated": "Export erstellt",
  "chrome.toast.conflictsExported": "{count} Konflikte exportiert",
  "chrome.toast.noConflicts": "Keine Konflikte im Snapshot",
  "chrome.toast.importNoRoots": "Import nicht möglich — keine schreibbaren Config-Wurzeln gefunden (Config geladen?)",
} as const satisfies Pick<MessageCatalog, ChromeMessageKey>
