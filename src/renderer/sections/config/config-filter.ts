import type { Category, ConfigEntry, EntryStatus, LlmConfig } from '@shared/contract'
import type { SearchHit } from './config-parts'

function visibleText(cat: Category, entry: ConfigEntry): string {
  return (entry.name + ' ' + entry.desc + ' ' + cat.label).toLowerCase()
}

function fileText(entry: ConfigEntry): string {
  const keys = entry.searchKeys ?? []
  const fields = entry.fields ?? {}
  const fieldText = Object.entries(fields).map(([k, v]) => k + ' ' + v).join(' ')
  return (keys.join(' ') + ' ' + fieldText).toLowerCase()
}

function pushHit(out: SearchHit[], llm: string, cat: Category, entry: ConfigEntry, q: string): void {
  const inVisible = visibleText(cat, entry).includes(q)
  const inFile = !inVisible && fileText(entry).includes(q)
  if (inVisible || inFile) out.push({ llm, cat, entry, inFile })
}

export function buildHits(
  families: Record<string, LlmConfig>,
  currentLlm: string,
  query: string,
  statusFilter: EntryStatus | null,
): SearchHit[] {
  const q = query.trim().toLowerCase()
  const out: SearchHit[] = []
  const ids = q ? Object.keys(families) : [currentLlm]
  for (const llm of ids) {
    const ad = families[llm]
    if (!ad) continue
    ad.categories.forEach((cat) => cat.entries.forEach((entry) => {
      if (statusFilter !== null && entry.status !== statusFilter) return
      pushHit(out, llm, cat, entry, q)
    }))
  }
  return out
}
