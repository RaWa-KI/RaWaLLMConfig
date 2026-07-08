import { deMessages } from './de'
import { enMessages } from './en'
import type { MessageKey, MessageParamsMap } from './types'

export { deMessages, enMessages }
export { MESSAGE_KEYS, MESSAGE_PARAM_NAMES } from './types'
export type { MessageCatalog, MessageKey, MessageParamsMap } from './types'

export const SUPPORTED_LOCALES = [
  { code: 'de', labelKey: 'settings.language.de' },
  { code: 'en', labelKey: 'settings.language.en' }
] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]['code']

export const DEFAULT_LOCALE: AppLocale = 'de'

const catalogs = {
  de: deMessages,
  en: enMessages
} as const

let currentLocale: AppLocale = DEFAULT_LOCALE

type NoParams<K extends MessageKey> = K extends MessageKey
  ? MessageParamsMap[K] extends undefined ? K : never
  : never
type WithParams<K extends MessageKey> = K extends MessageKey
  ? MessageParamsMap[K] extends undefined ? never : K
  : never

export function msg<K extends NoParams<MessageKey>>(key: K): string
export function msg<K extends NoParams<MessageKey>>(key: K, params: undefined, locale: AppLocale): string
export function msg<K extends WithParams<MessageKey>>(key: K, params: MessageParamsMap[K], locale?: AppLocale): string
export function msg<K extends MessageKey>(key: K, params?: MessageParamsMap[K], locale = currentLocale): string {
  const template = catalogs[locale][key] ?? deMessages[key]
  if (!params) return template
  const values = params as Record<string, string>
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : placeholder
  })
}

export function msgText(key: MessageKey, locale = currentLocale): string {
  return catalogs[locale][key] ?? deMessages[key]
}

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && value in catalogs
}

export function getLocale(): AppLocale {
  return currentLocale
}

export function setLocale(locale: AppLocale): void {
  currentLocale = locale
}
