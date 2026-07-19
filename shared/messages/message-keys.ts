import type { MessageKey } from './types'
import { CORE_MESSAGE_KEYS } from './message-keys-core'
import { UPDATE_MESSAGE_KEYS } from './message-keys-update'
import { COMPARE_MESSAGE_KEYS } from './message-keys-compare'
import { CHROME_MESSAGE_KEYS } from './message-keys-chrome'
import { OVERVIEW_MESSAGE_KEYS } from './message-keys-overview'
import { CONFIG_WARNINGS_MESSAGE_KEYS } from './message-keys-config-warnings'
import { CONFIG_MESSAGE_KEYS } from './message-keys-config'

export const MESSAGE_KEYS = [
  ...CORE_MESSAGE_KEYS,
  ...UPDATE_MESSAGE_KEYS,
  ...COMPARE_MESSAGE_KEYS,
  ...CHROME_MESSAGE_KEYS,
  ...OVERVIEW_MESSAGE_KEYS,
  ...CONFIG_WARNINGS_MESSAGE_KEYS,
  ...CONFIG_MESSAGE_KEYS,
] as const satisfies readonly MessageKey[]
