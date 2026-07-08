import type { MessageCatalog } from './types'
import { COMPARE_MESSAGE_KEYS } from './message-keys-compare'

type CompareMessageKey = (typeof COMPARE_MESSAGE_KEYS)[number]

export const enCompareMessages = {
  "compare.mode.list": "Entries in this list",
  "compare.mode.sameFile": "Same file in several places",
  "compare.sameFile.aria": "Same file in several places",
  "compare.sameFile.title": "Same file in several places",
  "compare.sameFile.subtitle": "Compare a known file across personal, shared, and workspace places.",
  "compare.sameFile.quickAgents": "Compare AGENTS.md everywhere",
  "compare.sameFile.chooseAria": "Choose file",
  "compare.sameFile.go": "Show files side by side",
  "compare.sameFile.empty": "No same-named files found.",
} as const satisfies Pick<MessageCatalog, CompareMessageKey>
