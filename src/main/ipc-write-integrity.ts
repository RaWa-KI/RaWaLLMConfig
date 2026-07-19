// ipc-write-integrity.ts — Self-registering Handler fuer die Integrity-
// Transaktionsschicht (W4). Kanaele: integrityPreview / integrityApply.
// Preview ist ein read-only Dry-Run-Scan -> KEIN write-enabled-Gate (wie andere
// Read-Ops), baut aber denselben ctx (archiveRoot/auditPath/allowedRoots).
// Apply mutiert -> isWriteEnabled() ZUERST (Muster ipc-write-dir.ts). Nur
// ipcMain.handle, kein .on. Antworten sanitisiert (IpcResult ohne Stack/Secret).
// ctx kommt aus getWriteContext() (Single Source, identisch zu Rename/Dir).
// ipc-write.ts (registerWriteBase) wird NICHT angefasst — disjunkt.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type {
  IntegrityPreviewRequest,
  IntegrityPreviewResult,
  IntegrityApplyRequest,
  IntegrityApplyResult
} from '@shared/contract-integrity'
import { isWriteEnabled, getWriteContext } from './services/write-mode'
import { previewIntegrity, applyIntegrity } from './services/integrity/apply-integrity'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { guardedAsync } from './lib/guarded'

// ctx fuer den Integrity-Service aus dem zentralen Schreib-Kontext ableiten
// (archiveRoot/auditPath/allowedRoots aus getWriteContext() -> configRoots()).
// Identische Quelle wie Rename/Dir-Handler, damit der Scan in Produktion nicht
// leer laeuft (allowedRoots = reale Config-Wurzeln bzw. Sandbox-Confinement).
function integrityCtx(): { archiveRoot: string; auditPath: string; allowedRoots: string[] } {
  const ctx = getWriteContext()
  return { archiveRoot: ctx.archiveRoot, auditPath: ctx.auditPath, allowedRoots: ctx.allowedRoots }
}

// Handler: Preview = transaktionaler Dry-Run-Scan (read-only). KEIN Schreib-Gate
// (wie scanMoveImpact/listDir): erzeugt nur den Plan + planHash, kein FS-Touch.
function handlePreview(req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult> {
  if (!req || typeof req.kind !== 'string' || !req.req) {
    return Promise.resolve({ data: null, error: 'invalid-request' })
  }
  return previewIntegrity(req, integrityCtx())
}

// Handler: Apply = transaktionale Mutation. Schreib-Gate ZUERST (kein guard/
// backup/mutate bei false). Hash-/Blocker-Gate liegt im Service (applyIntegrity).
async function handleApply(req: IntegrityApplyRequest): Promise<IntegrityApplyResult> {
  if (!isWriteEnabled()) return Promise.resolve({ data: null, error: WRITE_DISABLED_REASON })
  if (!req || !req.plan || typeof req.planHash !== 'string') {
    return Promise.resolve({ data: null, error: 'invalid-request' })
  }
  const result = await applyIntegrity(req, integrityCtx())
  // Nur wirklich angewandte Transaktionen invalidieren (Teilplan B).
  if (result.data?.applied) markScanCachesStale('write:integrity-apply')
  return result
}

/**
 * Integrity-Handler registrieren (self-registering). Genau EINMAL aufrufen
 * (via registerWrite() in register-write.ts). Faesst ipc-write.ts nicht an.
 */
export function registerIntegrityWrite(): void {
  ipcMain.handle(
    IPC_WRITE.integrityPreview,
    (_e, req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult> =>
      guardedAsync('integrityPreview', () => handlePreview(req))
  )
  ipcMain.handle(
    IPC_WRITE.integrityApply,
    (_e, req: IntegrityApplyRequest): Promise<IntegrityApplyResult> =>
      guardedAsync('integrityApply', () => handleApply(req))
  )
}
