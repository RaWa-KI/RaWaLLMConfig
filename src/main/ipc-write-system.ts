// ipc-write-system.ts — Self-registering System-Edit-Handler (Cluster C).
// Registriert den system:write-Kanal. isWriteEnabled()-Gate zuerst, dann der
// guarded()-Wrapper (sanitisiertes IpcResult) wie alle ipc-write-*-Kanaele.
// Muster: ipc-write-reconcile.ts. Kein direkter fs-Write hier.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { SystemEditRequest, SystemEditResult } from '@shared/contract-write'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { setSystemOverrides } from './services/system-store'
import { guarded } from './lib/guarded'

function handleSystemEdit(req: SystemEditRequest): SystemEditResult {
  // Gate ZUERST — keine Mutation ohne RAWALLM_WRITE_ENABLED
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }

  if (!req || !Array.isArray(req.patches) || req.patches.length === 0) {
    return { data: null, error: 'invalid-request' }
  }

  // Schreib-Kontext durchreichen: backup-first (archiveRoot) + Audit (auditPath)
  // analog der uebrigen Schreib-Kanaele.
  const ctx = getWriteContext()
  const patched = setSystemOverrides(req.patches, ctx.archiveRoot, ctx.auditPath)
  return { data: { patched, manual: true }, error: null }
}

/**
 * System-Write-Handler registrieren (self-registering).
 * Genau EINMAL aufrufen (Welle 3 / WP-INT-02).
 */
export function registerSystemWrite(): void {
  ipcMain.handle(
    IPC_WRITE.systemWrite,
    (_e, req: SystemEditRequest): SystemEditResult =>
      guarded('systemWrite', () => handleSystemEdit(req))
  )
}
