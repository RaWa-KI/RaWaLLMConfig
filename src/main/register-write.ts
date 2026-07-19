// register-write.ts — EIN Aufruf-Punkt (Welle 3 / WP-INT-02), der die drei
// Write-/Read-Registrare buendelt: Basis (apply + config:readFull, Teil A),
// Reconcile (config:reconcile, Teil B, self-registering) und Prefs/Explain
// (prefs:get/set + config:explain, Teil D, self-registering). Jeder Registrar
// faesst seine eigenen ipcMain.handle-Kanaele an; hier wird nur orchestriert.
// Jeder Aufruf ist einzeln graceful gekapselt: faellt ein Registrar aus, bleibt
// die read-only-App und die uebrigen Write-Kanaele lauffaehig. GENAU EINMAL aus
// index.ts aufrufen (kein zweiter handle auf denselben Kanal -> Electron-Crash).
import { registerWriteBase } from './ipc-write'
import { registerReconcileWrite } from './ipc-write-reconcile'
import { registerPrefsWrite, initPrefsStore } from './ipc-write-prefs'
import { registerDirWrite } from './ipc-write-dir'
import { registerSystemWrite } from './ipc-write-system'
import { registerEnvWrite } from './ipc-write-env'
import { registerRenameWrite } from './ipc-write-rename'
import { registerIntegrityWrite } from './ipc-write-integrity'
import { registerStrukturScan } from './scan/struktur-scan'
import { registerGraphIngest } from './scan/graphify-ingest'
import { registerGraphIgnore } from './ipc-write-ignore'
import { registerListIpc } from './ipc-list'
import { registerCompareMulti } from './ipc-compare'
import { registerArchiveRestore } from './ipc-archive'
import { registerSourcesIpc } from './ipc-sources'
import { registerCoverageAckIpc } from './ipc-write-coverage-ack'
import { recordWriteRegistrarFailure } from './services/write-mode'

// Einen einzelnen Registrar sicher aufrufen (Fehler isoliert, Status ohne Details).
export function safeRegister(label: string, fn: () => void): void {
  try {
    fn()
  } catch {
    recordWriteRegistrarFailure(label)
    console.error('[register-write]', `${label}: fehlgeschlagen`)
  }
}

/**
 * Alle Write-/neuen-Read-IPC-Handler registrieren. Genau EINMAL bei app.whenReady
 * aufrufen (index.ts). Reihenfolge unkritisch — die Kanaele sind disjunkt.
 * initPrefsStore() laueft async vor dem Fenster-Open (MariaDB-Probe oder File-Fallback).
 */
export async function registerWrite(): Promise<void> {
  safeRegister('base', registerWriteBase)
  safeRegister('reconcile', registerReconcileWrite)
  safeRegister('prefs', registerPrefsWrite)
  safeRegister('dir', registerDirWrite)
  safeRegister('system', registerSystemWrite)
  safeRegister('env', registerEnvWrite)
  safeRegister('rename', registerRenameWrite)
  safeRegister('integrity', registerIntegrityWrite)
  safeRegister('struktur', registerStrukturScan)
  safeRegister('graph', registerGraphIngest)
  safeRegister('graphIgnore', registerGraphIgnore)
  safeRegister('list', registerListIpc)
  safeRegister('compare', registerCompareMulti)
  safeRegister('archive', registerArchiveRestore)
  safeRegister('sources', registerSourcesIpc)
  safeRegister('coverageAck', registerCoverageAckIpc)
  // Store einmalig aufloesen (MariaDB-Probe oder File-Fallback); kein Pool pro Request.
  try {
    await initPrefsStore()
  } catch (err) {
    console.error('[register-write] initPrefsStore fehlgeschlagen:',
      err instanceof Error ? err.message : 'fail')
  }
}
