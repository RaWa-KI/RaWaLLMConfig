import type { MessageCatalog } from './types'
import { CHROME_MESSAGE_KEYS } from './message-keys-chrome'

type ChromeMessageKey = (typeof CHROME_MESSAGE_KEYS)[number]

export const enChromeMessages = {
  "chrome.brand.title": "Config",
  "chrome.brand.subtitle": "LLM & system overview",
  "chrome.detail.baum": "Tree",
  "chrome.detail.graph": "Graph",
  "chrome.detail.system": "System",
  "chrome.detail.struktur": "Structure",
  "chrome.detail.prefs": "Settings",
  "chrome.detail.quellen": "Additional folders",
  "chrome.action.export": "Export JSON",
  "chrome.action.exportTitle": "Export saves a JSON file with the current config overview.",
  "chrome.action.backupImportTitle": "Save and read back in",
  "chrome.action.conflicts": "Export conflicts as JSON",
  "chrome.action.conflictsTitle": "Export only conflicts as JSON",
  "chrome.action.import": "Import file",
  "chrome.action.importTitle": "Import reads RaWaLLMConfig JSON or single Markdown files. You choose the target folder before writing.",
  "chrome.toast.exportCreated": "Export created",
  "chrome.toast.conflictsExported": "{count} conflicts exported",
  "chrome.toast.noConflicts": "No conflicts in the snapshot",
  "chrome.toast.importNoRoots": "Import not possible — no writable config roots found (config loaded?)",
} as const satisfies Pick<MessageCatalog, ChromeMessageKey>
