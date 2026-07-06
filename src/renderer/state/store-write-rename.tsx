import { useCallback } from 'react'
import type {
  RenameRequest,
  RenameResult,
  MoveVersionedRequest,
  MoveVersionedResult,
  MoveImpactScanRequest,
  MoveImpactScanResult
} from '@shared/contract-write-rename'

// Renderer-Slice fuer Umbenennen-/Verschieben-Routen (WP-04). Aus
// store-write-config.tsx ausgelagert (HR27: Hauptdatei bleibt <300 Z). Mutation
// laeuft AUSSCHLIesslich ueber die getypten Bridge-Methoden (window.electronAPI.
// renameEntry / moveEntryVersioned) — KEIN ungetypter ipcRenderer-Direktaufruf,
// KEIN fs/path im Renderer. Secrets/maskierte Inhalte fliessen nie. partial wird
// als ehrlicher Teilfehler-Hinweis gemeldet (analog reconcileFolder).

// Schmale Brücke zu den Status-Settern der Hauptkomponente (kein eigener State).
// showToast-Signatur ist Single Source of Truth aus StoreActions (types.ts).
export interface RenameMoveDeps {
  setBusy(v: boolean): void
  setLastError(v: string | null): void
  showToast(msg: string, icon?: string): void
  reload(): void
}

// Bridge-Aufruf gekapselt: ohne Bridge ein sanitisiertes Fehler-Result (kein throw).
async function callRename(req: RenameRequest): Promise<RenameResult> {
  if (typeof window === 'undefined' || !window.electronAPI?.renameEntry) {
    return { data: null, error: 'Bridge nicht verfügbar' }
  }
  return window.electronAPI.renameEntry(req)
}

async function callMoveVersioned(req: MoveVersionedRequest): Promise<MoveVersionedResult> {
  if (typeof window === 'undefined' || !window.electronAPI?.moveEntryVersioned) {
    return { data: null, error: 'Bridge nicht verfügbar' }
  }
  return window.electronAPI.moveEntryVersioned(req)
}

async function callMoveImpactScan(req: MoveImpactScanRequest): Promise<MoveImpactScanResult> {
  if (typeof window === 'undefined' || !window.electronAPI?.moveImpactScan) {
    return { data: null, error: 'Bridge nicht verfügbar' }
  }
  return window.electronAPI.moveImpactScan(req)
}

// Aktionen fuer Umbenennen/Verschieben, gebaut aus den Status-Settern der
// Hauptkomponente. Liefert true bei Erfolg/Teilerfolg, false bei hartem Fehler.
export function useRenameMoveActions(deps: RenameMoveDeps): {
  renameEntry(req: RenameRequest): Promise<boolean>
  moveEntryVersioned(req: MoveVersionedRequest): Promise<boolean>
  moveImpactScan(req: MoveImpactScanRequest): Promise<MoveImpactScanResult>
} {
  const { setBusy, setLastError, showToast, reload } = deps

  const renameEntry = useCallback(
    async (req: RenameRequest): Promise<boolean> => {
      setBusy(true)
      setLastError(null)
      let res: RenameResult
      try {
        res = await callRename(req)
      } catch {
        res = { data: null, error: 'Bridge-Fehler' }
      } finally {
        setBusy(false)
      }
      if (res.error || !res.data) {
        setLastError(res.error ?? 'Unbekannter Fehler')
        showToast(res.error ?? 'Umbenennen fehlgeschlagen', 'warn')
        return false
      }
      reload()
      showToast(
        res.data.partial ? 'Teilweise umbenannt (einige Seiten übersprungen)' : 'Umbenannt',
        res.data.partial ? 'warn' : 'check'
      )
      return true
    },
    [setBusy, setLastError, showToast, reload]
  )

  const moveEntryVersioned = useCallback(
    async (req: MoveVersionedRequest): Promise<boolean> => {
      setBusy(true)
      setLastError(null)
      let res: MoveVersionedResult
      try {
        res = await callMoveVersioned(req)
      } catch {
        res = { data: null, error: 'Bridge-Fehler' }
      } finally {
        setBusy(false)
      }
      if (res.error || !res.data) {
        setLastError(res.error ?? 'Unbekannter Fehler')
        showToast(res.error ?? 'Verschieben fehlgeschlagen', 'warn')
        return false
      }
      reload()
      showToast('Verschoben', 'check')
      return true
    },
    [setBusy, setLastError, showToast, reload]
  )

  const moveImpactScan = useCallback(
    async (req: MoveImpactScanRequest): Promise<MoveImpactScanResult> => {
      setBusy(true)
      setLastError(null)
      let res: MoveImpactScanResult
      try {
        res = await callMoveImpactScan(req)
      } catch {
        res = { data: null, error: 'Bridge-Fehler' }
      } finally {
        setBusy(false)
      }
      if (res.error) setLastError(res.error)
      return res
    },
    [setBusy, setLastError]
  )

  return { renameEntry, moveEntryVersioned, moveImpactScan }
}
