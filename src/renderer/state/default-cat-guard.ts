import type { AppData, Category } from '@shared/contract'
import { clearOverviewFocus, readOverviewFocus, type OverviewNavigationAction } from '../sections/overview/overview-navigation'
import { resolveConfigFocusTarget } from '../sections/config/config-focus'
import { DIAGNOSIS_CAT_ID } from '../sections/config/diagnosis-cat'

// WP-1 (B1) Guided-Focus-Race: Der Default-Kategorie-Effekt im Store lief in
// jedem Commit und ueberschrieb das vom Focus-Effekt (ConfigSection) gesetzte
// Ziel mit cats[0] — der gefuehrte Sprung landete auf der falschen Kategorie.
// Solange ein Config-Focus ansteht, darf der Default nicht greifen; der
// Focus-Effekt setzt die Ziel-Kategorie selbst. Import-Richtung state ->
// sections/overview ist zyklenfrei (overview-navigation importiert nur
// type-only aus state/types).
// WP3: Die Pseudo-Kategorie „Diagnose“ ist eine gueltige, stabile Auswahl —
// ohne diese Ausnahme wuerde der Effekt sie sofort mit cats[0] ueberschreiben.
// WP-F1F8: Nur Fokusse, deren Effekt die Ziel-Kategorie SELBST setzt, duerfen
// den Default blockieren. Das sind Entry-Fokusse und — seit dem Routen-Sweep
// 2026-08-07 — auch Dubletten-Fokusse (der ConfigSection-Fokus-Effekt wendet
// beide direkt an; ohne Block ueberschriebe cats[0] die Dubletten-Kategorie
// beim Familienwechsel). Familien-/LLM-Fokusse setzen keine Kategorie — ohne
// Default bliebe die Config dort ohne Kategorie haengen.
export function shouldApplyDefaultCat(
  cats: Category[],
  catId: string | null,
  focus: OverviewNavigationAction | null = readOverviewFocus('config')
): boolean {
  if (cats.length === 0) return false
  if (focus?.focusId?.startsWith('config-entry-')) return false
  if (focus?.focusId?.startsWith('config-duplicates-')) return false
  if (catId === DIAGNOSIS_CAT_ID) return false
  return catId == null || !cats.some((c) => c.id === catId)
}

// WP-F2: Ein unaufloesbarer Config-Fokus (Eintrag umbenannt/geloescht oder
// ohne focusId) blockierte den Default-Kategorie-Effekt fuer die volle TTL
// (5 Min) — die Config blieb ohne Kategorie haengen. Solche Fokusse werden
// verworfen, sobald Daten da sind und der Fokus nachweislich nicht aufloest.
// Solange keine Daten geladen sind, bleibt der Fokus unangetastet (B1-Race-
// Schutz: der guided Sprung braucht ihn noch).
// WP-F1F8: Aufloesbarkeit heisst alle config-* Fokus-Familien (Entry, Familie,
// LLM, Dubletten) — der entry-only Resolver verwarf sonst gueltige Fokusse.
export function dropUnresolvableConfigFocus(data: AppData | null | undefined): void {
  if (!data) return
  const focus = readOverviewFocus('config')
  if (focus && !resolveConfigFocusTarget(data, focus.focusId)) clearOverviewFocus()
}
