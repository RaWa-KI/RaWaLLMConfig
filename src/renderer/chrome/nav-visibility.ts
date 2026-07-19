import type { DisplayMode, Section } from '../state/types'
import { isExpertOnlySection } from '../state/section-visibility'

// Die Modus-Weiche selbst lebt seit E-WP1-Reviewfix in
// state/section-visibility; chrome re-exportiert sie, damit bestehende
// Importeure (App, LlmBar, Specs) unveraendert weiterlaufen.
export { isExpertOnlySection, sectionVisibleForMode } from '../state/section-visibility'

// Filtert Nav-Eintraege je Modus. Generisch, damit LlmBar seine NavItem-Liste
// behaelt; im Expert-Modus bleibt die Liste unveraendert (Referenz).
export function filterSectionsForMode<T extends { id: Section }>(
  items: ReadonlyArray<T>,
  mode: DisplayMode
): ReadonlyArray<T> {
  if (mode === 'expert') return items
  return items.filter((item) => !isExpertOnlySection(item.id))
}
