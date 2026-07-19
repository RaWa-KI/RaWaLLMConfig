import type { MessageParamNamesFor } from './message-param-names-types'
import type { ChromeMessageParamsMap } from './message-params-chrome'

export const CHROME_MESSAGE_PARAM_NAMES = {
  "chrome.brand.title": [],
  "chrome.brand.subtitle": [],
  "chrome.detail.baum": [],
  "chrome.detail.graph": [],
  "chrome.detail.system": [],
  "chrome.detail.struktur": [],
  "chrome.detail.prefs": [],
  "chrome.detail.quellen": [],
  "chrome.nav.more": [],
  "chrome.nav.moreOpen": [],
  "chrome.nav.moreClose": [],
  "chrome.nav.overflowLabel": [],
  "chrome.action.export": [],
  "chrome.action.exportTitle": [],
  "chrome.action.backupImportTitle": [],
  "chrome.action.conflicts": [],
  "chrome.action.conflictsTitle": [],
  "chrome.action.import": [],
  "chrome.action.importTitle": [],
  "chrome.toast.exportCreated": [],
  "chrome.toast.conflictsExported": ["count"],
  "chrome.toast.noConflicts": [],
  "chrome.toast.importNoRoots": [],
} as const satisfies MessageParamNamesFor<ChromeMessageParamsMap>
