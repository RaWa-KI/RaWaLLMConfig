// ipc-write-drift.ts — Drift-Relation-Festlegungen (WP1): read ungated,
// write via isWriteEnabled() gegated. Vorbild ipc-write-coverage-ack.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type { DriftDecisionsData, DriftWriteDecisionRequest } from '@shared/contract-drift'
import { isWriteEnabled } from './services/write-mode'
import { createDriftRelationStore } from './services/drift-relation-store'
import { WRITE_DISABLED_REASON } from './ipc-write'
import { markScanCachesStale } from './services/scan-invalidation'
import { guarded } from './lib/guarded'

let store: ReturnType<typeof createDriftRelationStore> | null = null

function getStore() {
  store ??= createDriftRelationStore()
  return store
}

export function registerDriftIpc(): void {
  ipcMain.handle(IPC_WRITE.driftReadDecisions, (): IpcResult<DriftDecisionsData> => (
    guarded('driftReadDecisions', () => ({ data: { decisions: getStore().readDecisions() }, error: null }))
  ))
  ipcMain.handle(IPC_WRITE.driftWriteDecision, (_event, req: DriftWriteDecisionRequest): IpcResult<DriftDecisionsData> => (
    guarded('driftWriteDecision', () => {
      if (!isWriteEnabled()) return { data: null, error: WRITE_DISABLED_REASON }
      const driftStore = getStore()
      const result = driftStore.writeDecision(req?.key, req?.decision)
      if (!result.ok) return { data: null, error: result.error }
      markScanCachesStale('write:drift-decision')
      return { data: { decisions: driftStore.readDecisions() }, error: null }
    })
  ))
}
