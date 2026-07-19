import type { MessageCatalog } from './types'
import { enCoreMessages } from './en-core'
import { enUpdateMessages } from './en-update'
import { enCompareMessages } from './en-compare'
import { enChromeMessages } from './en-chrome'
import { enOverviewMessages } from './en-overview'
import { enConfigWarningsMessages } from './en-config-warnings'
import { enConfigMessages } from './en-config'

export const enMessages = {
  ...enCoreMessages,
  ...enUpdateMessages,
  ...enCompareMessages,
  ...enChromeMessages,
  ...enOverviewMessages,
  ...enConfigWarningsMessages,
  ...enConfigMessages,
} as const satisfies MessageCatalog
