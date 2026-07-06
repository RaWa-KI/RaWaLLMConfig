import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { WriteAction, WriteRequest, WriteResult, DirReconcileRequest } from '@shared/contract-write'
import type { RenameRequest, MoveVersionedRequest, MoveImpactScanRequest, MoveImpactScanResult } from '@shared/contract-write-rename'
import { useStore } from './store'
import { useRenameMoveActions } from './store-write-rename'
import { useDirActions } from './store-write-config-dir-actions'
import { callApply, fetchWriteStatus, callSetEnabled, type WriteStatus } from './store-write-config-bridge'

// Renderer-Write-Slice (Teil C, Welle 2). Eigene Datei (kein gemeinsames
// store-write.tsx mit B/D -> Disjunktheit). Mutation laeuft AUSSCHLIESSLICH ueber
// die Teil-A-Write-API (window.electronAPI.writeApply); KEIN fs/path im Renderer.
// Optimistic: pending wird sofort gesetzt; bei IPC-Fehler revert + Toast, bei
// Erfolg Re-Load via useStore().reloadConfig() (kein Stale-State). Secrets nie sichtbar.
// Write-Status (enabled/sandbox/reason) wird beim Mount via writeStatus() geladen
// und kann per refreshWriteStatus()/enableWrite() aktualisiert werden.

// Sicht der pendierenden Mutation, die ein ConfirmDialog vor Apply anzeigt.
// `ownerEdit`: Owner-Override fuer den owner-initiierten Einzeldatei-Edit
// (nur edit/add). Wird vom Confirm-Consumer an editEntry/addEntry weitergereicht
// und im WriteRequest bis zur Main-Guard durchgereicht.
export interface PendingWrite {
  action: WriteAction
  path: string
  content?: string
  to?: string
  label: string
  ownerEdit?: boolean
}

export interface WriteConfigValue {
  busy: boolean
  pending: PendingWrite | null
  lastError: string | null
  // Write-Modus-Status (pinned contract — Namen exakt beibehalten).
  writeEnabled: boolean
  writeSandbox: boolean
  writeReason: string | null
  registrarFailures: string[]
  refreshWriteStatus(): Promise<void>
  enableWrite(): Promise<boolean>
  // Schreib-Aktionen (jede ruft writeApply, setzt Toast, revertet bei Fehler).
  // `ownerEdit` (Owner-Override, nur edit/add) wird bis in den WriteRequest
  // durchgereicht; ohne Flag bleibt die Secret-Klasse strikt geblockt.
  editEntry(path: string, content: string, ownerEdit?: boolean): Promise<boolean>
  addEntry(path: string, content: string, ownerEdit?: boolean): Promise<boolean>
  removeEntry(path: string): Promise<boolean>
  moveEntry(path: string, to: string): Promise<boolean>
  // Dir-Operationen (Teil B — Bridge-only, write-gated).
  archiveDirEntry(path: string): Promise<boolean>
  moveDirEntry(path: string, to: string): Promise<boolean>
  reconcileFolder(req: DirReconcileRequest): Promise<boolean>
  // Umbenennen-/Verschieben-Routen (WP-04; getypte Bridge, partial-Hinweis).
  renameEntry(req: RenameRequest): Promise<boolean>
  moveEntryVersioned(req: MoveVersionedRequest): Promise<boolean>
  moveImpactScan(req: MoveImpactScanRequest): Promise<MoveImpactScanResult>
  // Confirm-Flow: pending setzen / verwerfen.
  requestWrite(p: PendingWrite): void
  cancelWrite(): void
}

const WriteConfigContext = createContext<WriteConfigValue | null>(null)
type StoreActions = ReturnType<typeof useStore>['actions']

function archiveToast(res: WriteResult, okMsg: string): { msg: string; icon: string } {
  const count = res.data?.inboundRefCount ?? 0
  if (count <= 0) return { msg: okMsg, icon: 'check' }
  return {
    msg: `${okMsg} — Achtung: ${count} Verweis(e) zeigen weiter auf den archivierten Pfad.`,
    icon: 'warn'
  }
}

function useWriteStatusControls() {
  const [writeStatus, setWriteStatus] = useState<WriteStatus>({
    enabled: false,
    sandbox: false,
    reason: null,
    registrarFailures: []
  })
  useEffect(() => { void fetchWriteStatus().then(setWriteStatus) }, [])
  const refreshWriteStatus = useCallback(async () => {
    const s = await fetchWriteStatus()
    setWriteStatus(s)
  }, [])
  const enableWrite = useCallback(async (): Promise<boolean> => {
    const s = await callSetEnabled(true)
    setWriteStatus(s)
    return s.enabled
  }, [])
  return { writeStatus, refreshWriteStatus, enableWrite }
}

function useWriteRunner(actions: StoreActions) {
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingWrite | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const run = useCallback(
    async (req: WriteRequest, okMsg: string): Promise<boolean> => {
      setBusy(true)
      setLastError(null)
      let res: WriteResult
      try {
        res = await callApply(req)
      } catch {
        res = { data: null, error: 'Bridge-Fehler' }
      } finally {
        setBusy(false)
        setPending(null)
      }
      if (res.error || !res.data) {
        setLastError(res.error ?? 'Unbekannter Fehler')
        actions.showToast(res.error ?? 'Schreiben fehlgeschlagen', 'warn')
        return false
      }
      actions.reloadConfig() // frischer config-Stand (kein Stale-State; PERF-HOCH-01: kein System-/Watcher-Rescan)
      const toast = req.action === 'archive' ? archiveToast(res, okMsg) : { msg: okMsg, icon: 'check' }
      actions.showToast(toast.msg, toast.icon)
      return true
    },
    [actions]
  )
  return { busy, pending, lastError, setBusy, setLastError, run, setPending }
}

function useBasicWriteActions(
  run: (req: WriteRequest, okMsg: string) => Promise<boolean>,
  setPending: (p: PendingWrite | null) => void
) {
  const editEntry = useCallback(
    (path: string, content: string, ownerEdit?: boolean) =>
      run({ action: 'edit', path, content, ...(ownerEdit ? { ownerEdit: true } : {}) }, 'Gespeichert'),
    [run]
  )
  const addEntry = useCallback(
    (path: string, content: string, ownerEdit?: boolean) =>
      run({ action: 'add', path, content, ...(ownerEdit ? { ownerEdit: true } : {}) }, 'Angelegt'),
    [run]
  )
  const removeEntry = useCallback(
    (path: string) => run({ action: 'archive', path }, 'Archiviert'),
    [run]
  )
  const moveEntry = useCallback(
    (path: string, to: string) => run({ action: 'move', path, to }, 'Verschoben'),
    [run]
  )
  const requestWrite = useCallback((p: PendingWrite) => setPending(p), [setPending])
  const cancelWrite = useCallback(() => setPending(null), [setPending])
  return { editEntry, addEntry, removeEntry, moveEntry, requestWrite, cancelWrite }
}

function useWriteSliceDeps(actions: StoreActions, core: ReturnType<typeof useWriteRunner>) {
  const sliceDeps = useMemo(
    () => ({
      setBusy: core.setBusy,
      setLastError: core.setLastError,
      showToast: actions.showToast,
      reload: actions.reloadConfig
    }),
    [actions, core.setBusy, core.setLastError]
  )
  const { archiveDirEntry, moveDirEntry, reconcileFolder } = useDirActions(sliceDeps)
  const { renameEntry, moveEntryVersioned, moveImpactScan } = useRenameMoveActions(sliceDeps)
  return { archiveDirEntry, moveDirEntry, reconcileFolder, renameEntry, moveEntryVersioned, moveImpactScan }
}

export function WriteConfigProvider({ children }: { children: ReactNode }) {
  const { actions } = useStore()
  const core = useWriteRunner(actions)
  const status = useWriteStatusControls()
  const basic = useBasicWriteActions(core.run, core.setPending)
  const slices = useWriteSliceDeps(actions, core)
  const value: WriteConfigValue = {
    busy: core.busy,
    pending: core.pending,
    lastError: core.lastError,
    writeEnabled: status.writeStatus.enabled,
    writeSandbox: status.writeStatus.sandbox,
    writeReason: status.writeStatus.reason,
    registrarFailures: status.writeStatus.registrarFailures,
    refreshWriteStatus: status.refreshWriteStatus,
    enableWrite: status.enableWrite,
    ...basic,
    ...slices
  }

  return <WriteConfigContext.Provider value={value}>{children}</WriteConfigContext.Provider>
}

export function useWriteConfig(): WriteConfigValue {
  const v = useContext(WriteConfigContext)
  if (!v) throw new Error('useWriteConfig ausserhalb WriteConfigProvider verwendet')
  return v
}
