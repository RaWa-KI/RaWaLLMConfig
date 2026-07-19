// ipc-archive.ts — Self-registering Archiv-/Restore-Handler (v1).
//   archive:list    -> read-only (nur stat, KEIN Write-Gate): listBackups.
//   archive:restore -> isWriteEnabled()-Gate ZUERST, dann restoreBackup
//                      (guard + backup-first + tmp+rename + audit im Service).
// Muster: ipc-write-system.ts (gated) + ipc-compare.ts (read-only). Kein direkter
// fs-Write hier; sanitisierte Fehler (kein roher Pfad/Stack/Secret nach aussen).
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type {
  ArchiveListResult,
  ArchiveRestoreRequest,
  ArchiveRestoreResult
} from '@shared/contract-archive'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { listBackups, restoreBackup } from './services/archive-restore'

// Liste der Backups (read-only). Archiv-Root kommt aus dem Write-Kontext
// (Single Source; Sandbox-confined wenn aktiv). Kein Gate — reines stat.
function handleArchiveList(): IpcResult<ArchiveListResult> {
  try {
    const { archiveRoot } = getWriteContext()
    return listBackups(archiveRoot)
  } catch (err) {
    console.error('[ipc-archive:list]', err instanceof Error ? err.message : 'fail')
    return { data: null, error: 'Archiv-Liste fehlgeschlagen' }
  }
}

// Restore (gated). Gate ZUERST — keine Mutation ohne RAWALLM_WRITE_ENABLED.
function handleArchiveRestore(req: ArchiveRestoreRequest): ArchiveRestoreResult {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.backupPath !== 'string' || typeof req.toPath !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  try {
    const ctx = getWriteContext()
    const result = restoreBackup(req, {
      archiveRoot: ctx.archiveRoot,
      auditPath: ctx.auditPath,
      allowedRoots: ctx.allowedRoots
    })
    if (result.data && !result.error) markScanCachesStale('write:archive-restore')
    return result
  } catch (err) {
    console.error('[ipc-archive:restore]', err instanceof Error ? err.message : 'fail')
    return { data: null, error: 'Wiederherstellung fehlgeschlagen' }
  }
}

/**
 * Archiv-/Restore-IPC registrieren (self-registering, via register-write.ts).
 * Genau EINMAL aufrufen (zwei Kanaele: archive:list read-only, archive:restore gated).
 */
export function registerArchiveRestore(): void {
  ipcMain.handle(IPC_WRITE.archiveList, (): IpcResult<ArchiveListResult> => handleArchiveList())
  ipcMain.handle(
    IPC_WRITE.archiveRestore,
    (_e, req: ArchiveRestoreRequest): ArchiveRestoreResult => handleArchiveRestore(req)
  )
}
