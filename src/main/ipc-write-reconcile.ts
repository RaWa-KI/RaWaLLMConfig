// ipc-write-reconcile.ts — Self-registering Reconcile-Handler (Teil B). Registriert
// NUR den `config:reconcile`-Kanal via ipcMain.handle und ruft den reconcile-Service
// (der via apply guard+backup-first schreibt; KEIN direkter fs-Write hier). A's
// ipc-write.ts (registerWriteBase) wird NICHT angefasst — Disjunktheit Welle 2.
// Antworten sind sanitisiert (IpcResult ohne Pfad-Stack/Secret). Nur `handle`,
// kein `on`. Aufgerufen wird registerReconcileWrite() erst in Welle 3 (WP-INT-02).
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { ReconcileRequest, ReconcileResult } from '@shared/contract-write'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { previewIntegrity, applyIntegrity } from './services/integrity/apply-integrity'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { guardedAsync } from './lib/guarded'

// reconcile: Owner-Entscheidung (keep-trunk|adopt-mirror) ausfuehren. KEIN
// Auto-Merge — die Entscheidung kommt aus der UI (Confirm + sichtbarer Diff).
async function handleReconcile(req: ReconcileRequest): Promise<ReconcileResult> {
  if (!req || typeof req.trunkPath !== 'string' || typeof req.mirrorPath !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  // Schreib-Gate ZUERST: reconcile mutiert (Trunk-edit + Mirror-Archiv).
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  const ctx = getWriteContext()
  const preview = await previewIntegrity({ kind: 'reconcile', req }, ctx)
  if (preview.error || !preview.data) return { data: null, error: preview.error ?? 'integrity-preview-failed' }
  const apply = await applyIntegrity({ plan: preview.data, planHash: preview.data.planHash }, ctx)
  if (apply.error || !apply.data) return { data: null, error: apply.error ?? 'integrity-apply-failed' }
  if (!apply.data.applied) return { data: null, error: 'integrity-rolled-back' }
  return {
    data: {
      trunkPath: req.trunkPath,
      mirrorArchivedTo: null,
      trunkBackupPath: null,
      decision: req.decision
    },
    error: null
  }
}

/**
 * Reconcile-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (Welle 3 / WP-INT-02). Faesst A's ipc-write.ts nicht an.
 */
export function registerReconcileWrite(): void {
  ipcMain.handle(IPC_WRITE.configReconcile, (_e, req: ReconcileRequest): Promise<ReconcileResult> =>
    guardedAsync('reconcile', () => handleReconcile(req))
  )
}
