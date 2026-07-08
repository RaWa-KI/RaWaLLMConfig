import type { IntegrationDefinition } from '@shared/contract-integrations'

export const watcherGovernanceIntegrationDefinition: IntegrationDefinition = {
  id: 'watcher-governance',
  label: 'Wartung & Hinweise',
  core: false,
  defaultEnabled: false,
  probeKind: 'reports'
}
