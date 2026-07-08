import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { EntryStatus } from '@shared/contract'
import type { DisplayMode, ImportDialogState, Mode, Section, Selection, StoreValue, ToastMsg } from './types'
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
  const value: StoreValue = { config, system, watcher, ui: ui.state, actions }
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
  const state = { section, llm, catId, mode, displayMode, search, statusFilter, sysArea, sel, toast, compareSel, comparePreset, importDialog }
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

function useStoreActions(ui: StoreUi, loadAll: () => Promise<void>, loadConfig: () => Promise<void>) {
  const showToast = useCallback((msg: string, icon?: string) => {
    ui.setToast({ msg, icon })
    window.setTimeout(() => ui.setToast(null), 2600)
  }, [ui])
  return {
    setSection: (s: Section) => {
      ui.setSection(s); ui.setSel(null); ui.setCompareSel(new Set()); ui.clearComparePreset()
    },
    setLlm: ui.setLlm,
    setCatId: (id: string | null) => {
      ui.setCatId(id); ui.setCompareSel(new Set()); ui.clearComparePreset()
    },
    setMode: ui.setMode,
    setDisplayMode: ui.setDisplayMode,
    setSearch: ui.setSearch,
    toggleStatusFilter: (s: EntryStatus) => ui.setStatusFilter((cur) => (cur === s ? null : s)),
    setSysArea: ui.setSysArea,
    openEntry: (catId: string, entryId: string) => ui.setSel({ catId, entryId }),
    closeEntry: () => ui.setSel(null),
    showToast,
    reload: () => void loadAll(),
    reloadConfig: () => void loadConfig(),
    toggleCompare: (id: string) => ui.setCompareSel((cur) => toggleSet(cur, id)),
    clearCompare: () => ui.setCompareSel(new Set()),
    setComparePreset: ui.setComparePreset,
    clearComparePreset: ui.clearComparePreset,
    openImportDialog: ui.setImportDialog,
    closeImportDialog: () => ui.setImportDialog(null)
  }
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
