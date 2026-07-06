import { useCallback, useState } from 'react'
import type { ReconcileRequest, ReconcileResult } from '@shared/contract-write'
import { useStore } from './store'

// Reconcile-Store-Slice (Teil B, Neuanlage) — nutzt das vorhandene useStore() fuer
// reload/Toast (KEIN gemeinsames store-write.tsx mit C/D -> Disjunktheit Welle 2).
// Ruft die Reconcile-IPC (window.electronAPI.writeReconcile) auf. Bei Erfolg reload
// der echten Daten + Toast; bei Fehler Toast + lokaler error-State (kein Crash,
// keine optimistische Falschanzeige). KEIN Auto-Merge: decision kommt aus der UI.

export interface ReconcileState {
  busy: boolean
  error: string | null
  // Owner-Entscheidung ausfuehren (UI hat vorher Confirm + Diff gezeigt).
  run(req: ReconcileRequest): Promise<boolean>
}

// Sanitisierte Fehlermeldung fürs UI (kein Pfad-Stack/Secret).
// Codes entsprechen den real emittierten Werten aus services/reconcile.ts.
function reasonText(error: string | null): string {
  if (error === 'owner-only/not-in-scope') return 'Pfad ist owner-only (nicht im Scope).'
  if (error === 'mirror-not-readable') return 'Quelldatei nicht lesbar.'
  if (error === 'archive-missing') return 'Archiv-Ziel fehlt — Aktion abgebrochen.'
  if (error === 'invalid-request') return 'Ungültige Anfrage (Pfade fehlen).'
  if (error === 'invalid-decision') return 'Ungültige Entscheidung — bitte neu auswählen.'
  if (error === 'mirror-archive-failed') return 'Archivierung der Spiegelkopie fehlgeschlagen.'
  if (error === 'trunk-edit-failed') return 'Trunk-Datei konnte nicht geschrieben werden.'
  return 'Reconcile fehlgeschlagen.'
}

export function useReconcile(): ReconcileState {
  const { actions } = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async (req: ReconcileRequest): Promise<boolean> => {
      if (typeof window === 'undefined' || !window.electronAPI) {
        setError('Bridge nicht verfügbar')
        actions.showToast('Bridge nicht verfügbar', 'x')
        return false
      }
      setBusy(true)
      setError(null)
      try {
        const res: ReconcileResult = await window.electronAPI.writeReconcile(req)
        if (res.error || !res.data) {
          const msg = reasonText(res.error)
          setError(res.error)
          actions.showToast(msg, 'x')
          return false
        }
        // Erst nach IPC-Erfolg echte Daten neu laden (reale Quelle hat sich geaendert).
        // Config-only (PERF-HOCH-01): Reconcile mutiert nur Config-Dateien.
        actions.reloadConfig()
        // Richtungs-neutral: je nach Owner-Entscheidung wandert Shared ODER die
        // Kopie ins Archiv — die Meldung nennt keine feste Seite.
        actions.showToast('Eingearbeitet — die andere Version wurde archiviert.', 'check')
        return true
      } catch {
        setError('reconcile-failed')
        actions.showToast('Reconcile fehlgeschlagen.', 'x')
        return false
      } finally {
        setBusy(false)
      }
    },
    [actions]
  )

  return { busy, error, run }
}
