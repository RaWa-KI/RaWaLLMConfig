import type { IntegrationDefinition } from '@shared/contract-integrations'

export const obsidianIntegrationDefinition: IntegrationDefinition = {
  id: 'obsidian',
  label: 'Notizen',
  core: false,
  defaultEnabled: false,
  probeKind: 'vault'
}
