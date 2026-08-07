import type { EntryStatus } from '@shared/contract'
import type { Mode, Selection, StoreActions } from '../../state/types'
import type { ConfigFocusResolution } from './config-focus'

// Gemeinsamer Anwendungs-Pfad fuer aufgeloeste Config-Fokusse (Routen-Sweep
// 2026-08-07): vorher wandte NUR der Details-Link der FocusNotice Familien-
// und Dubletten-Ziele an — der direkte Diagnose-Klick blieb bei „duplicates"
// ohne sichtbares Ziel (P1 „Problem pruefen: claude Dubletten"). Jetzt nutzen
// ConfigSection (Fokus-Effekt) und FocusNotice dieselbe Routine:
// 'entry'      → Kategorie + Uebersicht + Drawer (openEntry)
// 'duplicates' → Kategorie mit Dubletten + Diff-Modus (DuplicatePanel)
// 'family'     → Familienwechsel reicht; der Scan-Fehler steht im Familienkopf.
export interface ConfigFocusUiState {
  llm: string
  catId: string | null
  mode: Mode
  search: string
  statusFilter: EntryStatus | null
  sel: Selection | null
}

// Rueckgabe true = Zielzustand BESTAETIGT (nichts mehr zu tun), false =
// Aktionen angestossen, Zustand noch nicht bestaetigt. Der Fokus-Effekt in
// ConfigSection ruft konvergent auf: Der Store-Effekt fuer den LLM-Wechsel
// (prevLlm) leert Modus/Suche/Auswahl NACH den Kind-Effekten — ein einmalig
// gesetztes Ziel wuerde dort wieder ueberschrieben. Erst wenn ein Lauf ohne
// Aktion durchgeht, gilt der Fokus als angewendet.
export function applyConfigFocusTarget(
  target: ConfigFocusResolution,
  ui: ConfigFocusUiState,
  actions: StoreActions
): boolean {
  if (target.llm !== ui.llm) {
    actions.setLlm(target.llm)
    return false
  }
  if (target.kind === 'family') return true
  let satisfied = true
  if (ui.search.trim()) {
    actions.setSearch('')
    satisfied = false
  }
  if (ui.statusFilter !== null) {
    actions.toggleStatusFilter(ui.statusFilter)
    satisfied = false
  }
  if (target.kind === 'duplicates') return applyDuplicates(target.catId, ui, actions) && satisfied
  return applyEntry(target.catId, target.entryId, ui, actions) && satisfied
}

function applyDuplicates(catId: string | null, ui: ConfigFocusUiState, actions: StoreActions): boolean {
  let satisfied = true
  if (catId && ui.catId !== catId) {
    actions.setCatId(catId)
    satisfied = false
  }
  if (ui.mode !== 'diff') {
    actions.setMode('diff')
    satisfied = false
  }
  return satisfied
}

function applyEntry(catId: string, entryId: string, ui: ConfigFocusUiState, actions: StoreActions): boolean {
  let satisfied = true
  if (ui.catId !== catId) {
    actions.setCatId(catId)
    satisfied = false
  }
  if (ui.mode !== 'overview') {
    actions.setMode('overview')
    satisfied = false
  }
  if (ui.sel?.catId !== catId || ui.sel.entryId !== entryId) {
    actions.openEntry(catId, entryId)
    satisfied = false
  }
  return satisfied
}
