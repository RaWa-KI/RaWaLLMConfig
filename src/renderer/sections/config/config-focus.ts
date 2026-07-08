import type { AppData } from '@shared/contract'

export interface ConfigFocusTarget {
  llm: string
  catId: string
  entryId: string
}

const ENTRY_PREFIX = 'config-entry-'

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
