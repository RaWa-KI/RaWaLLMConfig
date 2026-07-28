import { useCallback, useEffect, useState } from 'react'

// use-explain (Welle 3 / WP-INT-01) — holt die laienverstaendliche "Was macht
// das?"-Erklaerung fuer ein Element via config:explain (Teil-D-Read-Kanal, regel-
// basiert, kein Datei-Read, kein Secret). Reiner Renderer-Hook: kapselt nur den
// Bridge-Call + Lade-/Fehlerzustand fuer das praesentierende ExplainPanel. Ohne
// Bridge (Browser/Test) -> sauberer Fehlerzustand statt Crash.
export interface ExplainView {
  title: string | null
  text: string | null
  loading: boolean
  error: string | null
}

const EMPTY: ExplainView = { title: null, text: null, loading: false, error: null }

export function useExplain(kind: string | null, name: string | null, desc?: string | null): ExplainView {
  const [view, setView] = useState<ExplainView>(EMPTY)

  const fetchExplain = useCallback(async (k: string, n: string, d: string | null): Promise<ExplainView> => {
    if (typeof window === 'undefined' || !window.electronAPI?.explain) {
      return { title: null, text: null, loading: false, error: 'Bridge nicht verfuegbar' }
    }
    // desc (entry.desc) geht mit: explain.ts nutzt ihn als inhaltliche Basis
    // der Erklaerung, bevor der generische Fallback greift.
    const res = await window.electronAPI.explain({ kind: k, name: n, desc: d ?? undefined })
    if (res.error || !res.data) {
      return { title: null, text: null, loading: false, error: res.error ?? 'Erklaerung nicht verfuegbar' }
    }
    return { title: res.data.title, text: res.data.text, loading: false, error: null }
  }, [])

  useEffect(() => {
    if (!kind || !name) {
      setView(EMPTY)
      return
    }
    let alive = true
    setView({ title: null, text: null, loading: true, error: null })
    void fetchExplain(kind, name, desc ?? null).then((v) => {
      if (alive) setView(v)
    })
    return () => {
      alive = false
    }
  }, [kind, name, desc, fetchExplain])

  return view
}
