export type MessageParamNamesFor<T extends Record<string, unknown>> = {
  [K in keyof T]: T[K] extends undefined
    ? readonly []
    : readonly (keyof T[K] & string)[]
}
