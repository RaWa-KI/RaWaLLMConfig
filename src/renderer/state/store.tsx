import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EntryStatus } from '@shared/contract'
import type { DisplayMode, ImportDialogState, Mode, Section, Selection, StoreActions, StoreValue, ToastMsg, UiState } from './types'
import { useComparePresetState } from './compare-preset'
import { useConfigLoad } from './useConfigLoad'

const StoreContext = createContext<StoreValue | null>(null)
const DISPLAY_MODE_KEY = 'rawallmconfig.displayMode'

export function StoreProvider({ children }: { children: ReactNode }) {
  const { config, system, watcher, loadAll, loadConfig, loadSystem, loadWatcher } = useConfigLoad()
  const ui = useStoreUiState()
  useStoreUiEffects(ui, config.data, system.data)
  useLazyDataEffects(ui, system, watcher, loadSystem, loadWatcher)
  const actions = useStoreActions(ui, loadAll, loadConfig)
  // Stabiler Context-Value (Teilplan C): Slices, ui.state und actions sind
  // memoized — der Value aendert seine Referenz nur bei echten Aenderungen.
  const value = useMemo<StoreValue>(
    () => ({ config, system, watcher, ui: ui.state, actions }),
    [config, system, watcher, ui.state, actions]
  )
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function useStoreUiState() {
  const [section, setSection] = useState<Section>('overview')
  const [llm, setLlm] = useState<string>('claude')
  const [catId, setCatId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('overview')
  const [displayMode, setDisplayMode] = useState<DisplayMode>(readDisplayMode)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EntryStatus | null>(null)
  const [sysArea, setSysArea] = useState('')
  const [sel, setSel] = useState<Selection | null>(null)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  // Offener Import-Ziel-Dialog (null = geschlossen). Nur UI-Sicht; der Write
  // laeuft ueber applyImportItems (guard + backup-first), nie aus dem Store.
  const [importDialog, setImportDialog] = useState<ImportDialogState | null>(null)
  // Mehrfachauswahl fuer den Vergleich. Immer ein NEUES Set setzen (Re-Render),
  // nie das vorhandene mutieren. Reset bei Kategorie-/Sektion-/Familienwechsel.
  const [compareSel, setCompareSel] = useState<Set<string>>(() => new Set())
  const { comparePreset, setComparePreset, clearComparePreset } = useComparePresetState()
  useEffect(() => persistDisplayMode(displayMode), [displayMode])
  // Stabiles state-Objekt (Teilplan C): Referenz aendert sich nur, wenn einer
  // der Einzelwerte kippt — haelt den Context-Value ruhig.
  const state = useMemo<UiState>(
    () => ({ section, llm, catId, mode, displayMode, search, statusFilter, sysArea, sel, toast, compareSel, comparePreset, importDialog }),
    [section, llm, catId, mode, displayMode, search, statusFilter, sysArea, sel, toast, compareSel, comparePreset, importDialog]
  )
  return {
    state,
    setSection,
    setLlm,
    setCatId,
    setMode,
    setDisplayMode,
    setSearch,
    setStatusFilter,
    setSysArea,
    setSel,
    setToast,
    setImportDialog,
    setCompareSel,
    setComparePreset,
    clearComparePreset,
  }
}

type StoreUi = ReturnType<typeof useStoreUiState>

function useStoreActions(ui: StoreUi, loadAll: () => Promise<void>, loadConfig: () => Promise<void>): StoreActions {
  // Nur die stabilen Setter/Callbacks als Deps: das actions-Objekt behaelt seine
  // Referenz ueber Renders (Teilplan C) statt bei jedem Render neu zu entstehen.
  const {
    setSection, setLlm, setCatId, setMode, setDisplayMode, setSearch, setStatusFilter, setSysArea,
    setSel, setToast, setImportDialog, setCompareSel, setComparePreset, clearComparePreset
  } = ui
  const showToast = useCallback((msg: string, icon?: string) => {
    setToast({ msg, icon })
    window.setTimeout(() => setToast(null), 2600)
  }, [setToast])
  return useMemo<StoreActions>(() => ({
    setSection: (s: Section) => {
      setSection(s); setSel(null); setCompareSel(new Set()); clearComparePreset()
    },
    setLlm,
    setCatId: (id: string | null) => {
      setCatId(id); setCompareSel(new Set()); clearComparePreset()
    },
    setMode,
    setDisplayMode,
    setSearch,
    toggleStatusFilter: (s: EntryStatus) => setStatusFilter((cur) => (cur === s ? null : s)),
    setSysArea,
    openEntry: (catId: string, entryId: string) => setSel({ catId, entryId }),
    closeEntry: () => setSel(null),
    showToast,
    reload: () => void loadAll(),
    reloadConfig: () => void loadConfig(),
    toggleCompare: (id: string) => setCompareSel((cur) => toggleSet(cur, id)),
    setCompareSelection: (ids: string[]) => setCompareSel(new Set(ids)),
    clearCompare: () => setCompareSel(new Set()),
    setComparePreset,
    clearComparePreset,
    openImportDialog: setImportDialog,
    closeImportDialog: () => setImportDialog(null)
  }), [
    setSection, setLlm, setCatId, setMode, setDisplayMode, setSearch, setStatusFilter, setSysArea,
    setSel, setImportDialog, setCompareSel, setComparePreset, clearComparePreset, showToast, loadAll, loadConfig
  ])
}

function readDisplayMode(): DisplayMode {
  if (typeof window === 'undefined') return 'simple'
  try {
    const value = window.localStorage.getItem(DISPLAY_MODE_KEY)
    return value === 'expert' ? 'expert' : 'simple'
  } catch {
    return 'simple'
  }
}

function persistDisplayMode(mode: DisplayMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DISPLAY_MODE_KEY, mode)
  } catch {
    // Persistenz ist Komfortzustand; die UI bleibt mit Default bedienbar.
  }
}

function toggleSet(cur: Set<string>, id: string): Set<string> {
  const next = new Set(cur)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function useStoreUiEffects(ui: StoreUi, configData: StoreValue['config']['data'], systemData: StoreValue['system']['data']) {
  const prevLlm = useRef(ui.state.llm)
  useEffect(() => {
    if (prevLlm.current === ui.state.llm) return
    prevLlm.current = ui.state.llm
    ui.setMode('overview')
    ui.setSearch('')
    ui.setStatusFilter(null)
    ui.setSel(null)
    ui.setCompareSel(new Set())
    ui.clearComparePreset()
  }, [ui])
  useEffect(() => {
    const cats = configData?.data[ui.state.llm]?.categories ?? []
    if (cats.length === 0) return
    if (ui.state.catId == null || !cats.some((c) => c.id === ui.state.catId)) {
      ui.setCatId(cats[0]?.id ?? null)
    }
  }, [configData, ui])
  useEffect(() => {
    const a = systemData?.areas[0]?.id
    if (a && !ui.state.sysArea) ui.setSysArea(a)
  }, [systemData, ui])
}

function useLazyDataEffects(
  ui: StoreUi,
  system: StoreValue['system'],
  watcher: StoreValue['watcher'],
  loadSystem: () => Promise<void>,
  loadWatcher: () => Promise<void>
) {
  const section = ui.state.section
  useEffect(() => {
    if ((section === 'overview' || section === 'system') && system.loading) void loadSystem()
  }, [section, system.loading, loadSystem])
  useEffect(() => {
    if ((section === 'overview' || section === 'updates') && watcher.loading) void loadWatcher()
  }, [section, watcher.loading, loadWatcher])
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore außerhalb StoreProvider verwendet')
  return v
}
