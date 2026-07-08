import type { MessageKey, MessageParamsMap } from './types'
import { CORE_MESSAGE_PARAM_NAMES } from './message-param-names-core'
import { UPDATE_MESSAGE_PARAM_NAMES } from './message-param-names-update'
import { COMPARE_MESSAGE_PARAM_NAMES } from './message-param-names-compare'
import { CHROME_MESSAGE_PARAM_NAMES } from './message-param-names-chrome'
import { OVERVIEW_MESSAGE_PARAM_NAMES } from './message-param-names-overview'
import { CONFIG_WARNINGS_MESSAGE_PARAM_NAMES } from './message-param-names-config-warnings'

export type MessageParamNames = {
  [K in MessageKey]: MessageParamsMap[K] extends undefined
    ? readonly []
    : readonly (keyof MessageParamsMap[K] & string)[]
}

export const MESSAGE_PARAM_NAMES: MessageParamNames = {
  ...CORE_MESSAGE_PARAM_NAMES,
  ...UPDATE_MESSAGE_PARAM_NAMES,
  ...COMPARE_MESSAGE_PARAM_NAMES,
  ...CHROME_MESSAGE_PARAM_NAMES,
  ...OVERVIEW_MESSAGE_PARAM_NAMES,
  ...CONFIG_WARNINGS_MESSAGE_PARAM_NAMES,
}
