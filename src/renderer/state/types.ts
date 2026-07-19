import type { AppData, EntryStatus, System, Watcher } from '@shared/contract'
import type { CompareCandidate } from '@shared/contract-compare'
import type { ImportItem } from '../lib/import-targets'

// Renderer-Zustandstypen. Datenslices spiegeln den Ladezustand der drei IPC-Kanaele.
export interface Slice<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export type Section =
  | 'overview'
  | 'config'
  | 'baum'
  | 'referenz'
  | 'graph'
  | 'system'
  | 'updates'
  | 'settings'
  | 'prefs'
  | 'struktur'
  | 'archiv'
  | 'quellen'
export type Mode = 'overview' | 'diff' | 'compare'
export type DisplayMode = 'simple' | 'expert'

export interface Selection {
  catId: string
  entryId: string
}

export interface ToastMsg {
  msg: string
  icon?: string
}

export interface CoverageCompareCellContext {
  id: string
  label?: string
  state?: string
  path?: string | null
  note?: string | null
  notes?: string[]
}

export interface CoverageCompareRowContext {
  cat: string
  name: string
  cells: CoverageCompareCellContext[]
  notes?: string[]
}

export interface CoverageComparePresetSource {
  section: Section
  llm: string
  catId: string | null
  rowId?: string
  createdAt: string
}

export interface CoverageComparePreset {
  source: 'coverage'
  row: CoverageCompareRowContext
  candidates: CompareCandidate[]
  createdFrom: CoverageComparePresetSource
}

// Offener Import-Ziel-Dialog: vom Gate klassifizierte Items + erlaubte
// Ziel-Wurzeln. null = kein Dialog offen. Reine UI-Sicht; der Write laeuft
// ausschliesslich ueber applyImportItems (guard + backup-first).
export interface ImportDialogState {
  items: ImportItem[]
  knownRoots: string[]
}

export interface UiState {
  section: Section
  llm: string
  catId: string | null
  mode: Mode
  displayMode: DisplayMode
  search: string
  statusFilter: EntryStatus | null
  sysArea: string
  sel: Selection | null
  toast: ToastMsg | null
  // Mehrfachauswahl fuer den Vergleich (Set von Entry-IDs der aktuellen Kategorie).
  // Leeres Set = nichts ausgewaehlt. Reset bei Kategorie-/Sektion-/Familienwechsel.
  compareSel: Set<string>
  // Optionales Preset aus Coverage-Zeilen. Bleibt getrennt von compareSel, damit
  // manueller Vergleich und synthetischer Coverage-Vergleich nicht kollidieren.
  comparePreset: CoverageComparePreset | null
  // Offener Import-Ziel-Dialog (null = geschlossen). Owner waehlt je ready-Item
  // die Ziel-Wurzel; Confirm schreibt via applyImportItems, Cancel schliesst ohne Write.
  importDialog: ImportDialogState | null
}

export interface StoreActions {
  setSection(s: Section): void
  setLlm(id: string): void
  setCatId(id: string | null): void
  setMode(m: Mode): void
  setDisplayMode(m: DisplayMode): void
  setSearch(q: string): void
  toggleStatusFilter(s: EntryStatus): void
  setSysArea(id: string): void
  openEntry(catId: string, entryId: string): void
  closeEntry(): void
  showToast(msg: string, icon?: string): void
  reload(): void
  // Config-only-Reload fuer Write-Pfade (PERF-HOCH-01): laedt nur den config-Slice
  // neu — keine System-/Watcher-Rescans je Write. reload() bleibt Voll-Reload.
  reloadConfig(): void
  // Vergleichs-Auswahl: einzelne Entry-ID togglen / Auswahl leeren (immutable).
  toggleCompare(id: string): void
  setCompareSelection(ids: string[]): void
  clearCompare(): void
  setComparePreset(preset: CoverageComparePreset): void
  clearComparePreset(): void
  // Import-Ziel-Dialog oeffnen (klassifizierte Items + erlaubte Wurzeln) / schliessen.
  openImportDialog(s: ImportDialogState): void
  closeImportDialog(): void
}

export interface StoreValue {
  config: Slice<AppData>
  system: Slice<System>
  watcher: Slice<Watcher>
  ui: UiState
  actions: StoreActions
}
