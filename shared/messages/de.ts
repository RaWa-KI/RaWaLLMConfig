import type { MessageCatalog } from './types'
import { deCoreMessages } from './de-core'
import { deUpdateMessages } from './de-update'
import { deCompareMessages } from './de-compare'
import { deChromeMessages } from './de-chrome'
import { deOverviewMessages } from './de-overview'
import { deConfigWarningsMessages } from './de-config-warnings'
import { deConfigMessages } from './de-config'

export const deMessages = {
  ...deCoreMessages,
  ...deUpdateMessages,
  ...deCompareMessages,
  ...deChromeMessages,
  ...deOverviewMessages,
  ...deConfigWarningsMessages,
  ...deConfigMessages,
} as const satisfies MessageCatalog
