import type { IpcRenderer } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { DriftApi, DriftDecisionsData, DriftWriteDecisionRequest } from '@shared/contract-drift'
import type { IpcResult } from '@shared/contract'

export type { DriftApi }

// Drift-Bridge (WP1): read ungated, write im Main via isWriteEnabled()
// gegated. Decision-Records sind wertfrei (kein Inhalt, kein Secret).
export function createDriftApi(ipcRenderer: IpcRenderer): DriftApi {
  return {
    readDriftDecisions: (): Promise<IpcResult<DriftDecisionsData>> =>
      ipcRenderer.invoke(IPC_WRITE.driftReadDecisions),
    writeDriftDecision: (req: DriftWriteDecisionRequest): Promise<IpcResult<DriftDecisionsData>> =>
      ipcRenderer.invoke(IPC_WRITE.driftWriteDecision, req)
  }
}
