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
  return renderTemplate(key, params as Record<string, string> | undefined, locale)
}

export function msgText(key: MessageKey, locale = currentLocale): string {
  return catalogs[locale][key] ?? deMessages[key]
}

// Anzeige-Modus-Projektion (Teil E, Owner-Entscheid D1–D3, 2026-07-18): Laien- und
// Experten-Texte laufen als getrennte Message-Projektion. 'simple' versucht zuerst
// `<key>.simple`, 'expert' `<key>.expert`; existiert die Variante nicht, gilt der
// Basis-Key (Fallback). Suffix-Keys liegen in derselben Domaene wie ihr Basis-Key.
export type MessageMode = 'simple' | 'expert'

export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(deMessages, key)
}

export function msgMode<K extends NoParams<MessageKey>>(mode: MessageMode, key: K): string
export function msgMode<K extends NoParams<MessageKey>>(mode: MessageMode, key: K, params: undefined, locale: AppLocale): string
export function msgMode<K extends WithParams<MessageKey>>(mode: MessageMode, key: K, params: MessageParamsMap[K], locale?: AppLocale): string
export function msgMode<K extends MessageKey>(mode: MessageMode, key: K, params?: MessageParamsMap[K], locale = currentLocale): string {
  const variant = `${key}.${mode}`
  const resolved: MessageKey = isMessageKey(variant) ? variant : key
  return renderTemplate(resolved, params as Record<string, string> | undefined, locale)
}

function renderTemplate(key: MessageKey, params: Record<string, string> | undefined, locale: AppLocale): string {
  const template = catalogs[locale][key] ?? deMessages[key]
  if (!params) return template
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => {
    return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : placeholder
  })
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
