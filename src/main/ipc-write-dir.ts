// ipc-write-dir.ts — Self-registering Dir-Handler (Teil A, CONTRACT-SSoT).
// Kanaele: writeArchiveDir / writeMoveDir / writeReconcileFolder.
// isWriteEnabled() ZUERST in jedem Handler (Muster ipc-write-reconcile.ts).
// Nur ipcMain.handle, kein .on. Antworten sanitisiert (IpcResult ohne Stack/Secret).
// ipc-write.ts (registerWriteBase) wird NICHT angefasst — disjunkt.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type {
  DirActionRequest,
  DirActionResult,
  DirReconcileRequest,
  DirReconcileResult
} from '@shared/contract-write'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { applyDirAction } from './services/apply'
import { previewIntegrity, applyIntegrity } from './services/integrity/apply-integrity'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { guarded, guardedAsync } from './lib/guarded'

// Handler: Verzeichnis archivieren (HR7-Move nach Archiv-Root).
function handleArchiveDir(req: DirActionRequest): DirActionResult {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.path !== 'string') return { data: null, error: 'invalid-request' }
  const ctx = getWriteContext()
  const result = applyDirAction({ action: 'archive-dir', path: req.path }, ctx)
  if (result.data && !result.error) markScanCachesStale('write:archive-dir')
  return result
}

// Handler: Verzeichnis verschieben (move-dir). Finding A: dieser Kanal wird nur
// owner-getriggert aufgerufen (Ordner-Verschieben-Dialog) -> ownerMove=true, das
// frei gewaehlte Ziel ist nicht mehr auf die Config-Wurzeln beschraenkt. Quell-
// Secret-Tree/Scope + snapshotDir bleiben hart (applyDirAction).
async function handleMoveDir(req: DirActionRequest): Promise<DirActionResult> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.path !== 'string' || typeof req.to !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  const ctx = getWriteContext()
  const moveReq = { version: 'shared' as const, fromPath: req.path, to: req.to }
  const preview = await previewIntegrity({ kind: 'move', req: moveReq }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity({ plan: preview.data, planHash: preview.data.planHash }, ctx)
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  markScanCachesStale('write:move-dir')
  return {
    data: {
      action: 'move-dir',
      path: req.path,
      movedTo: apply.data.movedTo ?? req.to,
      snapshotPath: null
    },
    error: null
  }
}

// Handler: Ordner-Merge 2->1 (Pro-Datei-Entscheidung).
async function handleReconcileFolder(req: DirReconcileRequest): Promise<DirReconcileResult> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.trunkPath !== 'string' || typeof req.mirrorPath !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  const ctx = getWriteContext()
  const preview = await previewIntegrity({ kind: 'reconcile-folder', req }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity({ plan: preview.data, planHash: preview.data.planHash }, ctx)
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  markScanCachesStale('write:reconcile-folder')
  return {
    data: {
      trunkPath: req.trunkPath,
      mirrorArchivedTo: null,
      files: preview.data.fsOps.map((op) => ({
        rel: op.rel ?? '',
        decision: op.decision as never,
        backupPath: null,
        archivedTo: null
      })),
      partial: false
    },
    error: null
  }
}

/**
 * Dir-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (via registerWrite() in register-write.ts). Faesst ipc-write.ts nicht an.
 */
export function registerDirWrite(): void {
  ipcMain.handle(
    IPC_WRITE.writeArchiveDir,
    (_e, req: DirActionRequest): DirActionResult =>
      guarded('archiveDir', () => handleArchiveDir(req))
  )
  ipcMain.handle(
    IPC_WRITE.writeMoveDir,
    (_e, req: DirActionRequest): Promise<DirActionResult> =>
      guardedAsync('moveDir', () => handleMoveDir(req))
  )
  ipcMain.handle(
    IPC_WRITE.writeReconcileFolder,
    (_e, req: DirReconcileRequest): Promise<DirReconcileResult> =>
      guardedAsync('reconcileFolder', () => handleReconcileFolder(req))
  )
}
