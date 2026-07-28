import { useCallback, useEffect, useState } from 'react'
import type { DriftDecision, DriftDecisionRecord } from '@shared/contract-drift'
import { DRIFT_FEHLER } from '@shared/drift-labels'
import { useStore } from './store'

// Drift-Store-Bridge (Plan 2026-07-20, WP4) — Muster store-write-reconcile.
// readDriftDecisions ist ungated, writeDriftDecision im Main isWriteEnabled-
// gegated. Nach erfolgreicher Festlegung reloadConfig() (der Scan wendet die
// persistierten Decisions wieder an; markScanCachesStale ist serverseitig
// bereits verdrahtet). KEIN Optimistic-Update — Quelle bleibt der Rescan.

export interface DriftDecisionsState {
  records: DriftDecisionRecord[]
  loaded: boolean
}

// Laedt die persistierten Festlegungen beim Mount (ungated read).
export function useDriftDecisions(): DriftDecisionsState {
  const [records, setRecords] = useState<DriftDecisionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    void (async () => {
      if (typeof window === 'undefined' || !window.electronAPI) return
      const res = await window.electronAPI.readDriftDecisions()
      if (!alive) return
      if (!res.error && res.data) setRecords(res.data.decisions)
      setLoaded(true)
    })()
    return () => {
      alive = false
    }
  }, [])
  return { records, loaded }
}

export interface DriftDecisionWriter {
  busy: boolean
  error: string | null
  decide(key: string, decision: DriftDecision): Promise<boolean>
}

// Festlegung schreiben (revidierbar: gleicher Key ersetzt den bisherigen).
export function useDriftDecisionWriter(): DriftDecisionWriter {
  const { actions } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = useCallback(
    async (key: string, decision: DriftDecision): Promise<boolean> => {
      if (typeof window === 'undefined' || !window.electronAPI) {
        setError(DRIFT_FEHLER.bridge)
        actions.showToast(DRIFT_FEHLER.bridge, 'x')
        return false
      }
      setBusy(true)
      setError(null)
      try {
        const res = await window.electronAPI.writeDriftDecision({ key, decision })
        if (res.error || !res.data) {
          setError(res.error ?? 'drift-write-failed')
          actions.showToast(DRIFT_FEHLER.schreiben, 'x')
          return false
        }
        // Rescan: der Scan liest die Decisions frisch und markiert die Gruppe.
        actions.reloadConfig()
        actions.showToast('Festlegung gespeichert.', 'check')
        return true
      } catch {
        setError('drift-write-failed')
        actions.showToast(DRIFT_FEHLER.schreiben, 'x')
        return false
      } finally {
        setBusy(false)
      }
    },
    [actions]
  )

  return { busy, error, decide }
}
