import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { DEFAULT_LOCALE, isLocale, setLocale } from '@shared/messages'
import type { AppLocale } from '@shared/messages'
import { usePrefs } from './store-write-prefs'

interface LocaleValue {
  locale: AppLocale
  setAppLocale(locale: AppLocale): Promise<void>
}

const LocaleContext = createContext<LocaleValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { prefs, setPref } = usePrefs()
  const locale = isLocale(prefs.locale) ? prefs.locale : DEFAULT_LOCALE

  useEffect(() => { setLocale(locale) }, [locale])

  const value: LocaleValue = {
    locale,
    setAppLocale: (nextLocale) => setPref('locale', nextLocale)
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale ausserhalb LocaleProvider verwendet')
  return value
}
