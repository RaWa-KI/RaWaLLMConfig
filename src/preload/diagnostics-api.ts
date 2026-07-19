import type { IpcRenderer } from 'electron'
import { IPC } from '@shared/channels'
import type { DiagnosticsApi, SaveErrorReportRequest } from '@shared/contract-diagnostics'

export type { DiagnosticsApi }

export function createDiagnosticsApi(ipcRenderer: IpcRenderer): DiagnosticsApi {
  return {
    saveErrorReport: (req: SaveErrorReportRequest) =>
      ipcRenderer.invoke(IPC.diagnosticsSaveErrorReport, req)
  }
}
