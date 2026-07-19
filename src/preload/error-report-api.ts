import type { IpcRenderer } from 'electron'
import { IPC_ERROR_REPORT } from '@shared/contract-error-report'
import type { ErrorReportApi, ErrorReportCollectInput, ErrorReportSubmitInput } from '@shared/contract-error-report'

export type { ErrorReportApi }

// Online-Fehlerbericht (D055): getypte Bridge ueber zwei whitelisted Kanaele.
// Der Versand selbst laeuft im Main — der Renderer sieht nur Vorschau + Status.
export function createErrorReportApi(ipcRenderer: IpcRenderer): ErrorReportApi {
  return {
    collect: (req: ErrorReportCollectInput) =>
      ipcRenderer.invoke(IPC_ERROR_REPORT.collect, req),
    submit: (req: ErrorReportSubmitInput) =>
      ipcRenderer.invoke(IPC_ERROR_REPORT.submit, req)
  }
}
