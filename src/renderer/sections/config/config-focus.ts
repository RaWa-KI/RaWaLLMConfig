import type { AppData } from '@shared/contract'
import { normalizeCat } from '@shared/cat-key'

export interface ConfigFocusTarget {
  llm: string
  catId: string
  entryId: string
}

// Aufgelöstes Config-Fokus-Ziel (WP-F1F8): neben dem Entry-Drawer kennen die
// Diagnosekarten auch Familien- (Scan-Fehler), LLM- und Dubletten-Fokusse.
// 'entry'      → Drawer via openEntry
// 'family'     → Familienwechsel (Scan-Fehler steht im Familienkopf)
// 'duplicates' → Familie + Kategorie mit Dubletten im Diff-Modus
export type ConfigFocusResolution =
  | ({ kind: 'entry' } & ConfigFocusTarget)
  | { kind: 'family'; llm: string }
  | { kind: 'duplicates'; llm: string; catId: string | null }

const ENTRY_PREFIX = 'config-entry-'
const LLM_PREFIX = 'config-llm-'
const FAMILY_PREFIX = 'config-family-'
const DUPLICATES_PREFIX = 'config-duplicates-'

export function resolveConfigFocus(data: AppData | null | undefined, focusId?: string | null): ConfigFocusTarget | null {
  if (!data || !focusId?.startsWith(ENTRY_PREFIX)) return null
  for (const [llm, family] of Object.entries(data.data)) {
    const prefix = `${ENTRY_PREFIX}${llm}-`
    if (!focusId.startsWith(prefix)) continue
    const entryId = focusId.slice(prefix.length)
    for (const cat of family.categories) {
      if (cat.entries.some((entry) => entry.id === entryId)) return { llm, catId: cat.id, entryId }
    }
  }
  return null
}

// Vollständiger Resolver über alle config-* Fokus-Familien (WP-F1F8). Liefert
// null, wenn das Ziel in den geladenen Daten nicht existiert — dann zeigt die
// Erklärbox bewusst keinen Details-Link.
export function resolveConfigFocusTarget(data: AppData | null | undefined, focusId?: string | null): ConfigFocusResolution | null {
  if (!data || !focusId) return null
  const entry = resolveConfigFocus(data, focusId)
  if (entry) return { kind: 'entry', ...entry }
  if (focusId.startsWith(ENTRY_PREFIX)) return null
  if (focusId.startsWith(LLM_PREFIX)) return knownFamily(data, focusId.slice(LLM_PREFIX.length))
  if (focusId.startsWith(FAMILY_PREFIX)) return knownFamily(data, focusId.slice(FAMILY_PREFIX.length))
  if (focusId.startsWith(DUPLICATES_PREFIX)) return duplicatesTarget(data, focusId.slice(DUPLICATES_PREFIX.length))
  return null
}

function knownFamily(data: AppData, llm: string): ConfigFocusResolution | null {
  if (!llm) return null
  if (data.data[llm] || data.llms.some((item) => item.id === llm)) return { kind: 'family', llm }
  return null
}

function duplicatesTarget(data: AppData, llm: string): ConfigFocusResolution | null {
  const family = data.data[llm]
  if (!family || family.duplicates.length === 0) return null
  const catId = family.categories.find((cat) =>
    family.duplicates.some((dup) => normalizeCat(dup.cat) === normalizeCat(cat.id))
  )?.id ?? null
  return { kind: 'duplicates', llm, catId }
}
