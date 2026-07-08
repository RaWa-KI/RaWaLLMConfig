import type { MessageCatalog } from './types'
import { COMPARE_MESSAGE_KEYS } from './message-keys-compare'

type CompareMessageKey = (typeof COMPARE_MESSAGE_KEYS)[number]

export const deCompareMessages = {
  "compare.mode.list": "Einträge dieser Liste",
  "compare.mode.sameFile": "Gleiche Datei an mehreren Orten",
  "compare.sameFile.aria": "Gleiche Datei an mehreren Orten",
  "compare.sameFile.title": "Gleiche Datei an mehreren Orten",
  "compare.sameFile.subtitle": "Vergleiche eine bekannte Datei über persönliche, geteilte und Workspace-Orte.",
  "compare.sameFile.quickAgents": "AGENTS.md überall vergleichen",
  "compare.sameFile.chooseAria": "Datei auswählen",
  "compare.sameFile.go": "Dateien nebeneinander anzeigen",
  "compare.sameFile.empty": "Keine gleichnamigen Dateien gefunden.",
} as const satisfies Pick<MessageCatalog, CompareMessageKey>
