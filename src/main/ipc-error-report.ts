import { BrowserWindow, ipcMain } from 'electron'
import type { IpcResult } from '@shared/contract'
import type {
  ErrorReportCollectInput,
  ErrorReportCollectResult,
  ErrorReportSubmitResult
} from '@shared/contract-error-report'
import { IPC_ERROR_REPORT } from '@shared/contract-error-report'
import { handleErrorReportCollect, handleErrorReportSubmit } from './services/error-report'

type WindowGetter = () => BrowserWindow | null

// Online-Fehlerbericht-IPC (D055). Der Trusted-Sender-Guard aus
// security/electron-hardening wrappt ipcMain.handle global — jeder hier
// registrierte Handler ist damit automatisch sender-geprueft. Fehler gehen
// als generische Meldung in der IpcResult-Huelle raus (kein Stack, kein Pfad).
export function registerErrorReportIpc(getWindow: WindowGetter): void {
  ipcMain.handle(IPC_ERROR_REPORT.collect, (event, req: ErrorReportCollectInput) =>
    safeErrorReport(() =>
      handleErrorReportCollect(req, BrowserWindow.fromWebContents(event.sender) ?? getWindow())))
  ipcMain.handle(IPC_ERROR_REPORT.submit, (_event, req: unknown) =>
    safeErrorReport(() => handleErrorReportSubmit(req)))
}

async function safeErrorReport<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (err) {
    console.error('[error-report]', err instanceof Error ? err.message : String(err))
    return { data: null, error: 'Fehlerbericht fehlgeschlagen' }
  }
}
