export type SameFileCompareLocale = 'de' | 'en'
type CopyKey = 'originUnknown' | 'placeCount' | 'statusReady' | 'statusPartial' | 'statusAmbiguous'

const sameFileCopy = {
  de: {
    originUnknown: 'Ort nicht sicher erkannt',
    placeCount: '{count} Orte',
    statusReady: 'Vergleich bereit: {count} Orte gefunden',
    statusPartial: 'Teilweise vergleichbar: nur ein Ort gefunden',
    statusAmbiguous: 'Vor dem Vergleich klaeren: ein Ort kommt mehrfach vor',
  },
  en: {
    originUnknown: 'Place not recognized safely',
    placeCount: '{count} places',
    statusReady: 'Ready to compare: {count} places found',
    statusPartial: 'Partly comparable: only one place found',
    statusAmbiguous: 'Check before comparing: one place appears more than once',
  },
} as const

export function sameFileCompareText(
  locale: SameFileCompareLocale,
  key: CopyKey,
  params: Record<string, string> = {},
): string {
  const template = sameFileCopy[locale]?.[key] ?? sameFileCopy.de[key]
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => params[name] ?? placeholder)
}
