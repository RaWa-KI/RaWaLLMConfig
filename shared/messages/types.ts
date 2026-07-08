import type { MessageParamsMap } from './message-params'

export type { MessageParamsMap } from './message-params'
export { MESSAGE_KEYS } from './message-keys'
export {
  MESSAGE_PARAM_NAMES,
  type MessageParamNames
} from './message-param-names'

export type MessageKey = keyof MessageParamsMap
export type MessageCatalog = { [K in MessageKey]: string }
