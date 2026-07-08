import { useCallback, useEffect, useRef, useState } from 'react'
import type { PrefValue } from '@shared/contract-write'
import { useStore } from './store'

// store-write-prefs — Prefs-Slice (Tweaks) als eigener Hook (Welle-2-Disjunktheit:
// KEIN gemeinsames store-write.tsx). Laedt Prefs via prefs:get, setzt via prefs:set
// (Main schreibt backup-first + atomar). Optimistic update mit revert + Toast bei
// Fehler. Default-Werte sind sofort sichtbar, auch ohne Bridge (Browser-/Test).
export type PrefsMap = Record<string, PrefValue>

// Renderer-Defaults (spiegeln prefs-store DEFAULT_PREFS; Erststart-Anzeige).
export const PREFS_DEFAULTS: PrefsMap = {
  theme: 'hell',
  structure: 'retro',
  density: 'airy',
  locale: 'de'
}

export interface PrefsSlice {
  prefs: PrefsMap
  loading: boolean
  loadError: string | null
  setPref(key: string, value: PrefValue): Promise<void>
}

export function usePrefs(): PrefsSlice {
  const { actions } = useStore()
  const [prefs, setPrefs] = useState<PrefsMap>(PREFS_DEFAULTS)
  // sm-06: stabiler Snapshot-Ref ausserhalb des Callbacks, damit ein zweiter
  // schneller setPref nicht auf einer veralteten prev-Closure revertet.
  const prefsRef = useRef<PrefsMap>(PREFS_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI?.prefsGet) {
      setPrefs(PREFS_DEFAULTS)
      setLoading(false)
      return
    }
    const res = await window.electronAPI.prefsGet()
    if (res.error || !res.data) {
      setLoadError(res.error ?? 'Prefs nicht lesbar')
      setLoading(false)
      return
    }
    const merged = { ...PREFS_DEFAULTS, ...res.data.prefs }
    prefsRef.current = merged
    setPrefs(merged)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const setPref = useCallback(async (key: string, value: PrefValue) => {
    // sm-06: Snapshot aus dem Ref nehmen (stabil, nicht aus Closure-prefs),
    // damit ein zweiter schneller Aufruf nicht den falschen Stand revertet.
    const prev = prefsRef.current
    const optimistic = { ...prev, [key]: value }
    prefsRef.current = optimistic
    setPrefs(optimistic)
    if (typeof window === 'undefined' || !window.electronAPI?.prefsSet) {
      actions.showToast('Bridge nicht verfügbar — nur lokal', 'warn')
      return
    }
    // try/catch: ein abgelehntes Bridge-Promise (z.B. Gate-OFF) darf die optimis-
    // tische Anzeige nicht eingefroren lassen — bei Fehler wird IMMER revertet.
    let res
    try {
      res = await window.electronAPI.prefsSet({ key, value })
    } catch {
      res = { data: null, error: 'Bridge-Fehler' } as Awaited<ReturnType<typeof window.electronAPI.prefsSet>>
    }
    if (res.error || !res.data) {
      prefsRef.current = prev
      setPrefs(prev) // revert auf stabilen Snapshot
      actions.showToast(res.error ?? 'Speichern fehlgeschlagen', 'warn')
      return
    }
    actions.showToast('Einstellung gespeichert (Backup angelegt)', 'check')
  }, [actions])

  return { prefs, loading, loadError, setPref }
}
