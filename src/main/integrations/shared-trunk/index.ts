import type { IntegrationDefinition } from '@shared/contract-integrations'

export const sharedTrunkIntegrationDefinition: IntegrationDefinition = {
  id: 'shared-trunk',
  label: 'Gemeinsame Regeln',
  core: false,
  defaultEnabled: false,
  probeKind: 'path'
}
