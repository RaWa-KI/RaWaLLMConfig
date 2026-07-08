import type { MessageParamNamesFor } from './message-param-names-types'
import type { CompareMessageParamsMap } from './message-params-compare'

export const COMPARE_MESSAGE_PARAM_NAMES = {
  "compare.mode.list": [],
  "compare.mode.sameFile": [],
  "compare.sameFile.aria": [],
  "compare.sameFile.title": [],
  "compare.sameFile.subtitle": [],
  "compare.sameFile.quickAgents": [],
  "compare.sameFile.chooseAria": [],
  "compare.sameFile.go": [],
  "compare.sameFile.empty": [],
} as const satisfies MessageParamNamesFor<CompareMessageParamsMap>
