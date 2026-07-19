// ipc-write-rename.ts — Self-registering Handler fuer die Umbenennen-/Verschieben-
// Routen (WP-03). Kanaele: writeRename / writeMoveVersioned.
// isWriteEnabled() ZUERST in jedem Handler (Muster ipc-write-dir.ts). Nur
// ipcMain.handle, kein .on. Antworten sanitisiert (IpcResult ohne Stack/Secret).
// KEINE eigene Guard-/Backup-Logik — die liegt im apply-Dispatch (rename-move.ts).
// ipc-write.ts (registerWriteBase) wird NICHT angefasst — disjunkt.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type {
  RenameRequest,
  RenameResult,
  MoveVersionedRequest,
  MoveVersionedResult,
  MoveImpactScanRequest,
  MoveImpactScanResult
} from '@shared/contract-write-rename'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { previewIntegrity, applyIntegrity } from './services/integrity/apply-integrity'
import { scanMoveImpact } from './services/move-impact-scan'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { guarded, guardedAsync } from './lib/guarded'

type RenameSideName = 'shared' | 'claude'

// Handler: Umbenennen (Datei ODER Ordner) mit Seitenwahl.
async function handleRename(req: RenameRequest): Promise<RenameResult> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.sides !== 'string' || typeof req.newName !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  const ctx = getWriteContext()
  const preview = await previewIntegrity({ kind: 'rename', req }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity({ plan: preview.data, planHash: preview.data.planHash }, ctx)
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  const sides = preview.data.fsOps.map((op, idx) => {
    const side = sideForRename(req, idx)
    return { side, status: 'renamed' as const, fromPath: op.from, toPath: op.to ?? null }
  })
  markScanCachesStale('write:rename')
  return { data: { newName: req.newName, sides, partial: false }, error: null }
}

function sideForRename(req: RenameRequest, index: number): RenameSideName {
  if (req.sides === 'shared') return 'shared'
  if (req.sides === 'claude') return 'claude'
  return index === 0 ? 'shared' : 'claude'
}

// Handler: Verschieben einer gewaehlten Version an einen freien Ziel-Pfad.
async function handleMoveVersioned(req: MoveVersionedRequest): Promise<MoveVersionedResult> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.version !== 'string' || typeof req.fromPath !== 'string' || typeof req.to !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  const ctx = getWriteContext()
  const preview = await previewIntegrity({ kind: 'move', req }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity({ plan: preview.data, planHash: preview.data.planHash }, ctx)
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  const fsOp = preview.data.fsOps[0]
  markScanCachesStale('write:move-versioned')
  return {
    data: {
      version: req.version,
      fromPath: req.fromPath,
      isDir: fsOp?.isDir === true,
      movedTo: apply.data.movedTo ?? fsOp?.to ?? req.to,
      backupPath: null
    },
    error: null
  }
}

// Handler: warn-only Referenz-Scan vor Move. Gated wie Move-UI, aber read-only.
function handleMoveImpactScan(req: MoveImpactScanRequest): MoveImpactScanResult {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.version !== 'string' || typeof req.fromPath !== 'string' || typeof req.to !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  return scanMoveImpact(req, { scanRoots: getWriteContext().allowedRoots })
}

/**
 * Rename-/Move-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (via registerWrite() in register-write.ts). Faesst ipc-write.ts nicht an.
 */
export function registerRenameWrite(): void {
  ipcMain.handle(
    IPC_WRITE.writeRename,
    (_e, req: RenameRequest): Promise<RenameResult> =>
      guardedAsync('rename', () => handleRename(req))
  )
  ipcMain.handle(
    IPC_WRITE.writeMoveVersioned,
    (_e, req: MoveVersionedRequest): Promise<MoveVersionedResult> =>
      guardedAsync('moveVersioned', () => handleMoveVersioned(req))
  )
  ipcMain.handle(
    IPC_WRITE.writeMoveImpactScan,
    (_e, req: MoveImpactScanRequest): MoveImpactScanResult =>
      guarded('moveImpactScan', () => handleMoveImpactScan(req))
  )
}
