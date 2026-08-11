// ipc-write-dir.ts — Self-registering Dir-Handler (Teil A, CONTRACT-SSoT).
// Kanaele: writeArchiveDir / writeMoveDir.
// isWriteEnabled() ZUERST in jedem Handler (Muster ipc-write-reconcile.ts).
// Nur ipcMain.handle, kein .on. Antworten sanitisiert (IpcResult ohne Stack/Secret).
// ipc-write.ts (registerWriteBase) wird NICHT angefasst — disjunkt.
//
// Der Ordner-Merge hat hier KEINEN eigenen Kanal mehr (2026-08-11): die UI zeigt
// erst den Plan (integrity:preview, kind 'reconcile-folder') und fuehrt ihn dann
// gegen seinen planHash aus (integrity:apply) — siehe ipc-write-integrity.ts.
import { ipcMain } from 'electron'
import { join, basename } from 'node:path'
import { IPC_WRITE } from '@shared/channels-write'
import type { DirActionRequest, DirActionResult } from '@shared/contract-write'
import type { IntegrityApplyProgressPayload } from '@shared/contract-integrity'
import { isWriteEnabled, getWriteContext, type WriteContext } from './services/write-mode'
import { applyDirAction } from './services/apply'
import { previewIntegrity, applyIntegrity } from './services/integrity/apply-integrity'
import { integrityProgressSender } from './ipc-integrity-progress'
import { pickFolder, type PickFolderOptions } from './services/folder-picker'
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

// Testbare Injektion: Ordner-Dialog + Schreib-Kontext koennen im Spec ohne
// echtes Electron-Fenster ersetzt werden. Default = die realen Implementierungen.
export interface MoveDirDeps {
  pick?: (opts?: PickFolderOptions) => Promise<string | null>
  getCtx?: () => WriteContext
}

// Handler: Verzeichnis verschieben (move-dir). SICHERHEIT (Finding A): das Ziel
// wird NICHT mehr aus req.to (renderer-geliefert) genommen — ein kompromittierter
// Renderer koennte sonst trotz ownerMove=true (Scope-Skip) ein beliebiges Ziel
// erzwingen (write-anywhere). Stattdessen oeffnet der Handler den NATIVEN
// Ordnerdialog im Main-Prozess (pickFolder); nur der dort owner-gewaehlte Pfad
// gilt als Ziel. req.to wird fuer move-dir bewusst IGNORIERT. Die "move anywhere"-
// Freiheit bleibt, weil der Owner im echten OS-Dialog waehlt; ownerMove=true ist
// damit sicher, weil das Ziel vertrauenswuerdig ist. Quell-Secret-Tree/Scope +
// snapshotDir bleiben hart (Integrity-Transaktion).
export async function handleMoveDir(
  req: DirActionRequest,
  deps?: MoveDirDeps,
  onProgress?: (p: IntegrityApplyProgressPayload) => void
): Promise<DirActionResult> {
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  if (!req || typeof req.path !== 'string') return { data: null, error: 'invalid-request' }
  const pick = deps?.pick ?? pickFolder
  // Zielordner kommt aus dem Main-Prozess-Ordnerdialog (owner-gewaehlt), NICHT aus
  // req.to. Der Quell-Ordner wandert unter seinem eigenen Namen in den gewaehlten
  // Ordner (join basename) — pickFolder liefert nur das Ziel-Verzeichnis.
  const picked = await pick()
  if (picked === null) return { data: null, error: 'move-cancelled' } // Owner-Abbruch: still, kein Fehler-Toast
  const to = join(picked, basename(req.path))
  const getCtx = deps?.getCtx ?? getWriteContext
  const ctx = getCtx()
  const moveReq = { version: 'shared' as const, fromPath: req.path, to }
  const preview = await previewIntegrity({ kind: 'move', req: moveReq }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity(
    { plan: preview.data, planHash: preview.data.planHash },
    { ...ctx, onProgress }
  )
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  markScanCachesStale('write:move-dir')
  return {
    data: {
      action: 'move-dir',
      path: req.path,
      movedTo: apply.data.movedTo ?? to,
      snapshotPath: null
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
    (e, req: DirActionRequest): Promise<DirActionResult> =>
      guardedAsync('moveDir', () => handleMoveDir(req, undefined, integrityProgressSender(e)))
  )
}
