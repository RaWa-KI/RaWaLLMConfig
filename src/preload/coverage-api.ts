import type { IpcRenderer } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { CoverageApi, CoverageAckData, CoverageWriteAckRequest } from '@shared/contract-coverage'
import type { IpcResult } from '@shared/contract'

export type { CoverageApi }

// Coverage-Ack-Bridge (E-WP3 L1): read ungated, write im Main via
// isWriteEnabled() gegated. Ack-Keys sind wertfrei (kein Inhalt, kein Secret).
export function createCoverageApi(ipcRenderer: IpcRenderer): CoverageApi {
  return {
    readCoverageAcks: (): Promise<IpcResult<CoverageAckData>> =>
      ipcRenderer.invoke(IPC_WRITE.coverageReadAcks),
    writeCoverageAck: (req: CoverageWriteAckRequest): Promise<IpcResult<CoverageAckData>> =>
      ipcRenderer.invoke(IPC_WRITE.coverageWriteAck, req)
  }
}
