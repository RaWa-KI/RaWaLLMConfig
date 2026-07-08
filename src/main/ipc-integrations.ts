import { ipcMain } from 'electron'
import { IPC_INTEGRATIONS } from '@shared/channels-integrations'
import type { IpcResult } from '@shared/contract'
import type { IntegrationId, ResolvedIntegration } from '@shared/contract-integrations'
import { findIntegrationDefinition } from './services/integration-registry'
import { createIntegrationStore } from './services/integration-store'
import { resolveIntegrations } from './services/integration-resolve'

interface IntegrationToggleInput {
  id?: unknown
  enabled?: boolean
  paused?: boolean
  root?: unknown
}

async function safeAsync<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { data: await fn(), error: null }
  } catch (err) {
    console.error('[ipc-integrations]', err instanceof Error ? err.message : String(err))
    return { data: null, error: 'Integrationen fehlgeschlagen' }
  }
}

function isIntegrationId(value: unknown): value is IntegrationId {
  return typeof value === 'string' && findIntegrationDefinition(value as IntegrationId) !== null
}

export function registerIntegrationsIpc(): void {
  const store = createIntegrationStore()

  async function listResolved(): Promise<ResolvedIntegration[]> {
    return resolveIntegrations({ activations: await store.listIntegrations() })
  }

  async function toggleAndResolve(input: IntegrationToggleInput): Promise<ResolvedIntegration[]> {
    if (!isIntegrationId(input.id)) throw new Error('invalid-integration-id')
    const root = typeof input.root === 'string' || input.root === null ? input.root : undefined
    const result = await store.setActivation({
      id: input.id,
      enabled: input.enabled,
      paused: input.paused,
      root
    })
    if (!result.ok) throw new Error(result.error ?? 'integration-write-failed')
    return resolveIntegrations({ activations: result.integrations })
  }

  ipcMain.handle(IPC_INTEGRATIONS.integrationsList, () =>
    safeAsync(() => listResolved()))
  ipcMain.handle(IPC_INTEGRATIONS.integrationsProbe, (_e, id: unknown) =>
    safeAsync(async () => (await listResolved()).find((item) => item.id === id) ?? null))
  ipcMain.handle(IPC_INTEGRATIONS.integrationsSetEnabled, (_e, req: IntegrationToggleInput) =>
    safeAsync(() => toggleAndResolve({ id: req?.id, enabled: req?.enabled, root: req?.root })))
  ipcMain.handle(IPC_INTEGRATIONS.integrationsSetPaused, (_e, req: IntegrationToggleInput) =>
    safeAsync(() => toggleAndResolve({ id: req?.id, paused: req?.paused })))
}
