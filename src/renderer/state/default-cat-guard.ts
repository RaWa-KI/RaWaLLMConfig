import type { Category } from '@shared/contract'
import { readOverviewFocus, type OverviewNavigationAction } from '../sections/overview/overview-navigation'

// WP-1 (B1) Guided-Focus-Race: Der Default-Kategorie-Effekt im Store lief in
// jedem Commit und ueberschrieb das vom Focus-Effekt (ConfigSection) gesetzte
// Ziel mit cats[0] — der gefuehrte Sprung landete auf der falschen Kategorie.
// Solange ein Config-Focus ansteht, darf der Default nicht greifen; der
// Focus-Effekt setzt die Ziel-Kategorie selbst. Import-Richtung state ->
// sections/overview ist zyklenfrei (overview-navigation importiert nur
// type-only aus state/types).
export function shouldApplyDefaultCat(
  cats: Category[],
  catId: string | null,
  focus: OverviewNavigationAction | null = readOverviewFocus('config')
): boolean {
  if (cats.length === 0) return false
  if (focus) return false
  return catId == null || !cats.some((c) => c.id === catId)
}
