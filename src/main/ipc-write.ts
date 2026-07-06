// ipc-write.ts — Basis-Registrar `registerWriteBase()` fuer den Write-Layer.
// Registriert NUR die Basis-Handler (apply + readFull) via ipcMain.handle auf den
// IPC_WRITE-Basis-Kanaelen. Alles laeuft ueber apply (guard+backup+atomar) bzw.
// secret-guard; KEIN direkter fs-Write im Handler. Antworten sind sanitisiert
// (IpcResult ohne Pfad-Stack/Secret). Reconcile-/Prefs-Handler sind self-
// registering in ipc-write-reconcile.ts (Teil B) / ipc-write-prefs.ts (Teil D) —
// NICHT hier. Damit fassen B/D diese Datei NIE an. Nur `handle`, kein `on`.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type {
  WriteRequest,
  WriteResult,
  ReadFullRequest,
  ReadFullResult
} from '@shared/contract-write'
import { applyWrite } from './services/apply'
import { readFullCore } from './services/read-full'
import {
  isWriteEnabled,
  getWriteContext,
  getWriteStatus,
  setWriteEnabledRuntime,
  WRITE_DISABLED_REASON
} from './services/write-mode'
import type { WriteStatusResult, WriteSetEnabledRequest } from '@shared/contract-write'
import { guarded } from './lib/guarded'

// Einheitliche Ablehnung, solange das Schreib-Gate AUS ist (Opt-out
// RAWALLM_WRITE_ENABLED=0). EINE zentrale Quelle in write-mode.ts (F6); hier nur
// re-exportiert, damit env-/dir-/reconcile-/system-/prefs-Handler unveraendert
// `WRITE_DISABLED_REASON` aus './ipc-write' beziehen.
export { WRITE_DISABLED_REASON }

// detectCredentials/deriveVarName leben im electron-freien Leaf-Modul
// services/credential-detect.ts; der readFull-Kern (Pipeline, 2-MB-Guard F8,
// Owner-Rohsicht plus defensive Watcher-Maskierung) lebt in services/read-full.ts
// (ARCH-MITTEL-01: EIN Kern fuer config:readFull UND sys:watcherReadFull).
// Dieser Handler ruft readFullCore mit credential:true (Env-Migrations-Hinweis).

// apply: einzelne Mutation ueber den Write-Dispatch (guard+backup+atomar+audit).
// Schreib-Gate ZUERST: ohne RAWALLM_WRITE_ENABLED -> Ablehnung OHNE guard/backup/
// mutate. Aktiviert -> write-context (archiveRoot/auditPath/allowedRoots) bauen.
function handleApply(req: WriteRequest): WriteResult {
  if (!req || typeof req.action !== 'string' || typeof req.path !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
  return applyWrite(req, getWriteContext())
}

// write:status — aktuellen Schreibstatus liefern (kein Secret, kein Pfad).
function handleWriteStatus(): WriteStatusResult {
  return guarded('writeStatus', () => ({ data: getWriteStatus(), error: null }))
}

// write:setEnabled — Laufzeit-Toggle. Payload validieren; bool-Eingang erzwingen.
// Setzt runtimeFlag in write-mode; backup-first/secret-guard/sandbox bleiben intact.
function handleWriteSetEnabled(req: WriteSetEnabledRequest): WriteStatusResult {
  return guarded('writeSetEnabled', () => {
    if (!req || typeof req.enabled !== 'boolean') {
      return { data: null, error: 'invalid-request' }
    }
    setWriteEnabledRuntime(req.enabled)
    return { data: getWriteStatus(), error: null }
  })
}

/**
 * Basis-Write-Handler registrieren. Idempotent? Nein — genau einmal aufrufen
 * (Welle 3 / WP-11). Reconcile/Prefs registrieren sich separat (B/D).
 */
export function registerWriteBase(): void {
  ipcMain.handle(IPC_WRITE.configApply, (_e, req: WriteRequest): WriteResult =>
    guarded('apply', () => handleApply(req))
  )
  ipcMain.handle(IPC_WRITE.configReadFull, (_e, req: ReadFullRequest): ReadFullResult =>
    guarded('readFull', () => readFullCore(req, { credential: true }))
  )
  ipcMain.handle(IPC_WRITE.writeStatus, (): WriteStatusResult => handleWriteStatus())
  ipcMain.handle(
    IPC_WRITE.writeSetEnabled,
    (_e, req: WriteSetEnabledRequest): WriteStatusResult => handleWriteSetEnabled(req)
  )
}
