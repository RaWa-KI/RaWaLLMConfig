// ipc-updates.ts — Self-registering Update-Manager-IPC (§3.4). Muster analog
// ipc-write-reconcile.ts: guardedAsync()-Wrapper, generische Fehlermeldung, nur
// ipcMain.handle (kein ipcMain.on). Progress via webContents.send (einzige
// sanktionierte Ausnahme — fixer Kanal, contextBridge-gewrappt, R6). Genau
// EINMAL aufrufen (index.ts, nach registerWrite, vor createWindow).
import { ipcMain, BrowserWindow } from 'electron'
import { IPC_UPDATES, IPC_UPDATES_EVENTS } from '@shared/channels-updates'
import type {
  UpdateCheckRequest,
  UpdateCheckResult,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateInstallRequest,
  UpdateInstallResult,
  UpdateStateResult,
  UpdateProgressPayload
} from '@shared/contract-updates'
import * as mgr from './services/update-manager'
import { guardedAsync } from './lib/guarded'

/**
 * Update-Manager-IPC-Handler registrieren. Genau EINMAL bei app.whenReady
 * aufrufen (nach registerWrite, vor createWindow). Getter-Closure deferred
 * mainWindow-Aufloesung bis zum send-Zeitpunkt (R7).
 */
export function registerUpdatesIpc(getMainWindow: () => BrowserWindow | null): void {
  // updates:check — read-only, ungated (wie prefs:get). TTL-Cache im Manager;
  // req.force umgeht ihn (explizite Nutzer-Aktion). Kanal-Vertrag unveraendert.
  ipcMain.handle(
    IPC_UPDATES.updatesCheck,
    (_evt, req?: UpdateCheckRequest): Promise<UpdateCheckResult> =>
      guardedAsync('check', () => mgr.checkForUpdates({ force: req?.force === true }))
  )

  // updates:getState — read-only, ungated
  ipcMain.handle(
    IPC_UPDATES.updatesGetState,
    (): Promise<UpdateStateResult> =>
      guardedAsync('getState', async () => ({ data: mgr.getUpdateState(), error: null }))
  )

  // updates:download — validiert version, Progress via webContents.send
  ipcMain.handle(
    IPC_UPDATES.updatesDownload,
    (_evt, req: UpdateDownloadRequest): Promise<UpdateDownloadResult> => {
      if (!req || typeof req.version !== 'string' || req.version.trim() === '') {
        return Promise.resolve({ data: null, error: 'invalid-request' })
      }
      return guardedAsync('download', () =>
        mgr.downloadUpdate(req, (p: UpdateProgressPayload) => {
          getMainWindow()?.webContents.send(IPC_UPDATES_EVENTS.updatesProgress, p)
        })
      )
    }
  )

  // updates:install — gated via RAWALLM_UPDATE_ENABLED in update-manager
  ipcMain.handle(
    IPC_UPDATES.updatesInstall,
    (_evt, req?: UpdateInstallRequest): Promise<UpdateInstallResult> =>
      guardedAsync('install', () => mgr.installUpdate(req ?? {}))
  )
}
