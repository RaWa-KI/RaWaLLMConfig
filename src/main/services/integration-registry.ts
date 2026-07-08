import type { IntegrationDefinition, IntegrationId } from '@shared/contract-integrations'
import { graphifyIntegrationDefinition } from '../integrations/graphify'
import { obsidianIntegrationDefinition } from '../integrations/obsidian'
import { sharedTrunkIntegrationDefinition } from '../integrations/shared-trunk'
import { watcherGovernanceIntegrationDefinition } from '../integrations/watcher-governance'
import { workspaceRegistryIntegrationDefinition } from '../integrations/workspace-registry'

export const CORE_INTEGRATION_DEFINITION: IntegrationDefinition = {
  id: 'core',
  label: 'Grundfunktionen',
  core: true,
  defaultEnabled: true,
  probeKind: 'none'
}

export const USER_SOURCES_INTEGRATION_DEFINITION: IntegrationDefinition = {
  id: 'user-sources',
  label: 'Eigene Ordner',
  core: false,
  defaultEnabled: true,
  probeKind: 'none'
}

const INTEGRATION_DEFINITIONS: IntegrationDefinition[] = [
  CORE_INTEGRATION_DEFINITION,
  USER_SOURCES_INTEGRATION_DEFINITION,
  sharedTrunkIntegrationDefinition,
  workspaceRegistryIntegrationDefinition,
  graphifyIntegrationDefinition,
  obsidianIntegrationDefinition,
  watcherGovernanceIntegrationDefinition
]

export function listIntegrationDefinitions(): IntegrationDefinition[] {
  return INTEGRATION_DEFINITIONS.map((definition) => ({ ...definition }))
}

export function findIntegrationDefinition(id: IntegrationId): IntegrationDefinition | null {
  const definition = INTEGRATION_DEFINITIONS.find((item) => item.id === id)
  return definition ? { ...definition } : null
}
