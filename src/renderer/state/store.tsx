import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppData, EntryStatus, System, Watcher } from '@shared/contract'
import type { ImportDialogState, Mode, Section, Selection, Slice, StoreValue, ToastMsg } from './types'
import { useComparePresetState } from './compare-preset'

type ConfigWatcherFsBridge = {
  configWatcherFs?: {
    onConfigChanged(cb: () => void): () => void
  }
  onConfigChanged?(cb: () => void): () => void
}

// Read-only Renderer-Store: laedt die drei IPC-Slices einmalig und haelt UI-Zustand.
// Kein FS-Zugriff, keine Mutation der echten Config (Phase 1).
function loadingSlice<T>(): Slice<T> {
  return { data: null, loading: true, error: null }
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Slice<AppData>>(loadingSlice)
  const [system, setSystem] = useState<Slice<System>>(loadingSlice)
  const [watcher, setWatcher] = useState<Slice<Watcher>>(loadingSlice)

  const [section, setSection] = useState<Section>('config')
  const [llm, setLlm] = useState<string>('claude')
  const [catId, setCatId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('overview')
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

  const showToast = useCallback((msg: string, icon?: string) => {
    setToast({ msg, icon })
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  // Nur den config-Slice laden (PERF-HOCH-01): Write-Pfade (Speichern/Archivieren/
  // Move/Rename/Reconcile) mutieren nur Config-Dateien — System-/Watcher-Rescans
  // je Write entfallen. loading wird hier bewusst NICHT auf true gesetzt
  // (kein UI-Flackern/Section-Unmount beim Re-Load nach Speichern).
  const loadConfig = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      setConfig({ data: null, loading: false, error: 'Bridge nicht verfügbar (Preload nicht geladen)' })
      return
    }
    try {
      const c = await window.electronAPI.readConfig()
      setConfig({ data: c.data, loading: false, error: c.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Config konnte nicht geladen werden'
      setConfig({ data: null, loading: false, error: msg })
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) {
      const e = 'Bridge nicht verfügbar (Preload nicht geladen)'
      setConfig({ data: null, loading: false, error: e })
      setSystem({ data: null, loading: false, error: e })
      setWatcher({ data: null, loading: false, error: e })
      return
    }
    // Drei unabhaengige IPC-Slices parallel abrufen (sm-04): config via loadConfig,
    // System + Watcher direkt — Promise.all-Semantik unveraendert.
    const [, s, w] = await Promise.all([
      loadConfig(),
      window.electronAPI.readSystem(),
      window.electronAPI.readWatcher()
    ])
    setSystem({ data: s.data, loading: false, error: s.error })
    setWatcher({ data: w.data, loading: false, error: w.error })
  }, [loadConfig])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useConfigWatcherAutoReload(loadConfig)

  // Sub-Ansicht NUR bei echtem Familienwechsel (Claude/Codex/…) zuruecksetzen —
  // NICHT bei jedem reload. Sonst springt die Seite nach jedem Speichern zurueck
  // (reload setzt eine neue config.data-Referenz). prevLlm-Ref erkennt den echten
  // Wechsel; ein reiner Reload (gleiche Familie) laesst Mode/Suche/Filter/Auswahl stehen.
  const prevLlm = useRef(llm)
  useEffect(() => {
    if (prevLlm.current === llm) return
    prevLlm.current = llm
    setMode('overview')
    setSearch('')
    setStatusFilter(null)
    setSel(null)
    setCompareSel(new Set())
    clearComparePreset()
  }, [llm, clearComparePreset])

  // Kategorie-Auswahl gueltig halten: beim Erst-Laden oder wenn die aktuelle
  // Auswahl in den (neuen) Daten nicht existiert (z.B. nach Familienwechsel) auf
  // die erste Kategorie der Familie setzen. Bei reinem Reload mit weiter gueltiger
  // Auswahl bleibt die Kategorie erhalten -> der Owner landet wieder, wo er war.
  useEffect(() => {
    const cats = config.data?.data[llm]?.categories ?? []
    if (cats.length === 0) return
    if (catId == null || !cats.some((c) => c.id === catId)) {
      setCatId(cats[0]?.id ?? null)
    }
  }, [config.data, llm, catId])

  useEffect(() => {
    const a = system.data?.areas[0]?.id
    if (a && !sysArea) setSysArea(a)
  }, [system.data, sysArea])

  const value: StoreValue = {
    config,
    system,
    watcher,
    ui: { section, llm, catId, mode, search, statusFilter, sysArea, sel, toast, compareSel, comparePreset, importDialog },
    actions: {
      // Sektionswechsel leert Auswahl + Vergleichs-Auswahl (sonst leckt die
      // Auswahl in die naechste Sektion).
      setSection: (s) => { setSection(s); setSel(null); setCompareSel(new Set()); clearComparePreset() },
      setLlm,
      // Kategoriewechsel leert die Vergleichs-Auswahl (sonst mischen sich
      // Eintraege verschiedener Kategorien).
      setCatId: (id) => { setCatId(id); setCompareSel(new Set()); clearComparePreset() },
      setMode,
      setSearch,
      // Toggle: gleicher Status nochmal -> Filter aus. Verhaelt sich wie search.
      toggleStatusFilter: (s) => setStatusFilter((cur) => (cur === s ? null : s)),
      setSysArea,
      openEntry: (cId, eId) => setSel({ catId: cId, entryId: eId }),
      closeEntry: () => setSel(null),
      showToast,
      reload: () => void loadAll(),
      // Config-only-Reload fuer Write-Pfade (PERF-HOCH-01) — kein System-/Watcher-Rescan.
      reloadConfig: () => void loadConfig(),
      // Immutable Toggle: immer ein NEUES Set erzeugen, sonst kein Re-Render.
      toggleCompare: (id) =>
        setCompareSel((cur) => {
          const next = new Set(cur)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      clearCompare: () => setCompareSel(new Set()),
      setComparePreset,
      clearComparePreset,
      // Import-Ziel-Dialog oeffnen/schliessen (reiner UI-Zustand).
      openImportDialog: (s) => setImportDialog(s),
      closeImportDialog: () => setImportDialog(null)
    }
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore außerhalb StoreProvider verwendet')
  return v
}

function useConfigWatcherAutoReload(loadConfig: () => Promise<void>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = window.electronAPI as (typeof window.electronAPI & ConfigWatcherFsBridge) | undefined
    const onConfigChanged = api?.configWatcherFs?.onConfigChanged ?? api?.onConfigChanged
    if (!onConfigChanged) return
    return onConfigChanged(() => {
      void loadConfig()
    })
  }, [loadConfig])
}
