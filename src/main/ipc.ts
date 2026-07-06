import { ipcMain } from 'electron'
import { IPC } from '@shared/channels'
import type { AppData, System, Watcher, IpcResult } from '@shared/contract'
import type { ReadFullRequest, ReadFullResult } from '@shared/contract-write'
import { scanSystem, scanWatcher } from './scan/sys-scan'
import { refreshVersions } from './services/cli-version-cache'
import { getConfigSnapshot } from './services/config-scan-cache'
import { readFullCore } from './services/read-full'
import { applySystemOverrides } from './services/system-store'
import { guarded } from './lib/guarded'

// PHASE-1: Read-only IPC-Registrierung. AUSSCHLIESSLICH ipcMain.handle
// (kein ipcMain.on, keine Mutation). Jeder Handler kapselt den Scan in safe(),
// damit ein Scanner-Fehler nie als Stacktrace oder Pfad an den Renderer leakt
// und der Main-Prozess nicht crasht. Fehler -> generische Meldung + null-data.

// Verpackt einen synchronen Scan in das contract-IpcResult. Fehler werden
// auf stderr geloggt (ohne Secrets/Pfade) und als generische Meldung
// zurueckgegeben — nie der Original-Error an den Renderer.
function safe<T>(fn: () => T): IpcResult<T> {
  try {
    return { data: fn(), error: null }
  } catch (err) {
    console.error('[ipc]', err instanceof Error ? err.message : String(err))
    return { data: null, error: 'Scan fehlgeschlagen' }
  }
}

// Async-Pendant zu safe() fuer non-blocking Scans (PERF-HOCH-01). Gleiches
// Fehler-Verhalten: console.error ohne Pfade, generische Meldung. Faengt auch
// Promise-Rejections — sonst landet eine unhandled rejection im Main-Prozess.
async function safeAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (err) {
    console.error('[ipc]', err instanceof Error ? err.message : String(err))
    return { data: null, error: 'Scan fehlgeschlagen' }
  }
}

export function registerIpc(): void {
  ipcMain.handle(IPC.configGetAll, (): Promise<IpcResult<AppData>> =>
    safeAsync(() => getConfigSnapshot({ reason: 'ipc:configGetAll' })))
  // System/Watcher async (PERF-HOCH-01): Versions-Spawns blockieren den
  // Main-Event-Loop nicht mehr; ipcMain.handle + Renderer sind Promise-basiert.
  ipcMain.handle(IPC.systemGetAreas, (): Promise<IpcResult<System>> =>
    safeAsync(async () => applySystemOverrides(await scanSystem())))
  ipcMain.handle(IPC.watcherGetState, (): Promise<IpcResult<Watcher>> =>
    safeAsync(() => scanWatcher()))
  // Versions-Refresh (PERF-HOCH-01): leert NUR den Prozess-Cache — die neuen
  // Versions-Spawns laufen erst beim folgenden readSystem/readWatcher, kein
  // Doppel-Scan hier. Eigener NEUER Kanal: nie ein zweiter ipcMain.handle auf
  // einen bestehenden Kanal (Electron wirft bei Doppel-Registrierung).
  ipcMain.handle(IPC.systemRefreshVersions, (): IpcResult<boolean> =>
    safe(() => {
      refreshVersions()
      return true
    }))
  // Read-Route fuer Watcher-Drilldown (K-05) — EIN readFull-Kern in
  // services/read-full.ts (ARCH-MITTEL-01), credential:false (watcher-Shape
  // unveraendert: content/masked, keine Credential-Meta). BEWUSSTE
  // Verhaltensaenderung: der watcher-Pfad hat jetzt den F8-2-MB-Groessen-Guard
  // (`zu-gross:`-Fehler statt potenziellem Main-Crash bei GGUF/Binaerdatei)
  // und guarded() als sanitisierten catch. Kein ipcMain.handle-Duplikat zu
  // config:readFull (registerWriteBase bindet IPC_WRITE.configReadFull).
  ipcMain.handle(
    IPC.watcherReadFull,
    (_e, req: ReadFullRequest): ReadFullResult =>
      guarded('watcherReadFull', () => readFullCore(req, { credential: false }))
  )
  // Hinweis (Phase 2 / Welle 3): Die neuen Read-Kanaele `config:readFull` (Voll-
  // inhalt via Secret-Guard, in `registerWriteBase()`) und `config:explain`
  // (regelbasiert, in `registerPrefsWrite()`) werden ueber den Write-Registrar-
  // Bund (`registerWrite()` in register-write.ts) gebunden, NICHT hier — kein
  // zweiter `ipcMain.handle` auf denselben Kanal (sonst Electron-Crash).
}
