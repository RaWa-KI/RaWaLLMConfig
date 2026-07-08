import type { IntegrationDefinition } from '@shared/contract-integrations'

export const graphifyIntegrationDefinition: IntegrationDefinition = {
  id: 'graphify',
  label: 'Wissensnetz',
  core: false,
  defaultEnabled: false,
  probeKind: 'graph'
}
