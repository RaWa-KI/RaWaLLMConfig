import { useEffect, useState } from 'react'
import { fetchContentFull } from './diff-shared'

// HR27-Split aus DirFileDrill.tsx: gemeinsamer on-demand-Lade-Hook fuer die
// Innendatei-Drilldowns (same/diff/single). Kapselt den identischen Lade-Ablauf
// (loading -> protected -> done inkl. masked/maskedCount), damit die einzelnen
// Drill-Komponenten unter dem 50-Zeilen-Funktionslimit bleiben.
//
// Inhalt kommt ausschliesslich ueber readFull (NIE reveal); bei maskierter
// Antwort wird masked=true gesetzt und der maskierte Text NUR angezeigt, nie
// zurueckgeschrieben (Secret-Gate bleibt unangetastet).

export type DrillState = 'loading' | 'done' | 'protected'

export interface DrillContent {
  state: DrillState
  content: string | null
  masked: boolean
  maskedCount: number
}

const EMPTY: DrillContent = { state: 'loading', content: null, masked: false, maskedCount: 0 }

// Laedt EINE Seite (z.B. fuer 'same' und 'trunk-only'/'mirror-only').
export function useDrillContent(path: string): DrillContent {
  const [c, setC] = useState<DrillContent>(EMPTY)
  useEffect(() => {
    let alive = true
    setC(EMPTY)
    void (async () => {
      const r = await fetchContentFull(path)
      if (!alive) return
      if (r === null) {
        setC({ state: 'protected', content: null, masked: false, maskedCount: 0 })
        return
      }
      setC({ state: 'done', content: r.content, masked: r.masked, maskedCount: r.maskedCount })
    })()
    return () => {
      alive = false
    }
  }, [path])
  return c
}

export interface DrillPair {
  state: DrillState
  trunk: string | null
  mirror: string | null
  masked: boolean
  maskedCount: number
}

const EMPTY_PAIR: DrillPair = {
  state: 'loading',
  trunk: null,
  mirror: null,
  masked: false,
  maskedCount: 0
}

// Laedt BEIDE Seiten parallel (fuer 'diff'). Beide null -> protected.
export function useDrillPair(trunkPath: string, mirrorPath: string): DrillPair {
  const [c, setC] = useState<DrillPair>(EMPTY_PAIR)
  useEffect(() => {
    let alive = true
    setC(EMPTY_PAIR)
    void (async () => {
      const [tc, mc] = await Promise.all([fetchContentFull(trunkPath), fetchContentFull(mirrorPath)])
      if (!alive) return
      if (tc === null || mc === null) {
        setC({ ...EMPTY_PAIR, state: 'protected' })
        return
      }
      setC({
        state: 'done',
        trunk: tc.content,
        mirror: mc.content,
        masked: tc.masked || mc.masked,
        maskedCount: tc.maskedCount + mc.maskedCount
      })
    })()
    return () => {
      alive = false
    }
  }, [trunkPath, mirrorPath])
  return c
}
