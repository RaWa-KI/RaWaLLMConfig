import type { IpcResult } from './contract'
import type { IntegrationId, ResolvedIntegration } from './contract-integrations'

export const IPC_INTEGRATIONS = {
  integrationsList: 'integrations:list',
  integrationsProbe: 'integrations:probe',
  integrationsSetEnabled: 'integrations:set-enabled',
  integrationsSetPaused: 'integrations:set-paused'
} as const

export type IpcIntegrationsChannel = (typeof IPC_INTEGRATIONS)[keyof typeof IPC_INTEGRATIONS]

export interface IntegrationSetEnabledRequest {
  id: IntegrationId
  enabled: boolean
  root?: string | null
}

export interface IntegrationSetPausedRequest {
  id: IntegrationId
  paused: boolean
}

export interface IntegrationsApi {
  list(): Promise<IpcResult<ResolvedIntegration[]>>
  probe(id: IntegrationId): Promise<IpcResult<ResolvedIntegration | null>>
  setEnabled(req: IntegrationSetEnabledRequest): Promise<IpcResult<ResolvedIntegration[]>>
  setPaused(req: IntegrationSetPausedRequest): Promise<IpcResult<ResolvedIntegration[]>>
}
