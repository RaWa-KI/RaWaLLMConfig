import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type { CoverageAckData, CoverageWriteAckRequest } from '@shared/contract-coverage'
import { isWriteEnabled } from './services/write-mode'
import { createCoverageAckStore } from './services/coverage-ack-store'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { guarded } from './lib/guarded'

let store: ReturnType<typeof createCoverageAckStore> | null = null

function getStore() {
  store ??= createCoverageAckStore()
  return store
}

export function registerCoverageAckIpc(): void {
  ipcMain.handle(IPC_WRITE.coverageReadAcks, (): IpcResult<CoverageAckData> => (
    guarded('coverageReadAcks', () => ({ data: { acknowledgements: getStore().readKeys().map((key) => ({ key })) }, error: null }))
  ))
  ipcMain.handle(IPC_WRITE.coverageWriteAck, (_event, req: CoverageWriteAckRequest): IpcResult<CoverageAckData> => (
    guarded('coverageWriteAck', () => {
      if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
      const coverageStore = getStore()
      const result = coverageStore.writeAck(req?.key)
      if (!result.ok) return { data: null, error: result.error }
      markScanCachesStale('write:coverage-ack')
      return { data: { acknowledgements: coverageStore.readKeys().map((key) => ({ key })) }, error: null }
    })
  ))
}
