import type { Category } from '@shared/contract'
import { categorySource } from './category-label'

// Gruppierung der Kategorie-Sidebar nach Quell-Werkzeug (WP-9).
// Hintergrund: die Userglobal-Familie mischt Kategorien aus Claude, Codex und
// Kimi in EINER flachen Liste. Gleichnamige Achsen (z. B. Agents) standen dort
// ohne Unterscheidung untereinander — ein Klick traf die falsche Datei.
// Diese Datei enthaelt nur reine Funktionen (keine React-Abhaengigkeit), damit
// die Gruppierung eigenstaendig testbar bleibt (HR27-Auflage).

/**
 * Warn-Farbe einer Kategorie (Konflikt > veraltet > Duplikat) oder null.
 * Aus ConfigSection.tsx hierher gezogen (WP-9, HR27-Zeilenbudget) — reine
 * Funktion ohne React-Bezug, Logik unveraendert.
 */
export function categoryFlag(cat: Category): string | null {
  if (cat.entries.some((e) => e.status === 'conflict')) return 'var(--terra)'
  if (cat.entries.some((e) => e.status === 'stale')) return 'var(--amber)'
  if (cat.entries.some((e) => e.status === 'dup')) return 'var(--papa)'
  return null
}

export interface CategoryGroup {
  /** Stabiler React-Key der Gruppe ('claude', 'codex', 'kimi' oder '_alle'). */
  key: string
  /** Zwischenueberschrift der Gruppe; null = keine Ueberschrift noetig. */
  title: string | null
  categories: Category[]
}

/** Zwischenueberschrift je Quell-Werkzeug — bewusst laienverstaendlich. */
export function sourceHeading(source: string): string {
  return `Werkzeug: ${source}`
}

/**
 * Gruppiert Kategorien nach Quell-Werkzeug, in Reihenfolge des ersten
 * Auftretens (Scan-Reihenfolge bleibt erhalten, nichts wird umsortiert oder
 * weggelassen). Kategorien ohne erkennbare Quelle (alle Nicht-Userglobal-
 * Familien) landen in EINER Gruppe ohne Ueberschrift — dort ist die Quelle
 * bereits durch die gewaehlte Familie eindeutig.
 */
export function groupCategoriesBySource(categories: Category[]): CategoryGroup[] {
  const groups: CategoryGroup[] = []
  const index = new Map<string, CategoryGroup>()
  for (const cat of categories) {
    const source = categorySource(cat.id)
    const key = source ? source.toLowerCase() : '_alle'
    let group = index.get(key)
    if (!group) {
      group = { key, title: source ? sourceHeading(source) : null, categories: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.categories.push(cat)
  }
  return groups
}
