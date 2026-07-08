import type { IntegrationDefinition } from '@shared/contract-integrations'

export const workspaceRegistryIntegrationDefinition: IntegrationDefinition = {
  id: 'workspace-registry',
  label: 'Arbeitsbereiche',
  core: false,
  defaultEnabled: false,
  probeKind: 'registry'
}
