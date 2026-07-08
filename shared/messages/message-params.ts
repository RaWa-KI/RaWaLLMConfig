import type { CoreMessageParamsMap } from './message-params-core'
import type { UpdateMessageParamsMap } from './message-params-update'
import type { CompareMessageParamsMap } from './message-params-compare'
import type { ChromeMessageParamsMap } from './message-params-chrome'
import type { OverviewMessageParamsMap } from './message-params-overview'
import type { ConfigWarningsMessageParamsMap } from './message-params-config-warnings'

export type MessageParamsMap =
  CoreMessageParamsMap
  & UpdateMessageParamsMap
  & CompareMessageParamsMap
  & ChromeMessageParamsMap
  & OverviewMessageParamsMap
  & ConfigWarningsMessageParamsMap
