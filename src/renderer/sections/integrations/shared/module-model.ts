import type {
  IntegrationAvailability,
  IntegrationDefinition,
  IntegrationId,
  ResolvedIntegration
} from '@shared/contract-integrations'
import type { MessageKey } from '@shared/messages'
import { msgText } from '../../../lib/messages'

export interface ModuleUiDefinition extends IntegrationDefinition {
  labelKey: MessageKey
  icon: string
  informational: boolean
  folderAction: boolean
}

export type ModuleCardState = ResolvedIntegration & {
  definition: ModuleUiDefinition
  pendingRoot?: string | null
}

const STATUS_LABEL_KEYS: Record<IntegrationAvailability, MessageKey> = {
  notConfigured: 'integrations.status.notConfigured',
  found: 'integrations.status.found',
  active: 'integrations.status.active',
  paused: 'integrations.status.paused',
  unavailable: 'integrations.status.unavailable'
}

export function statusLabel(availability: IntegrationAvailability): string {
  return msgText(STATUS_LABEL_KEYS[availability])
}

export function localizedDefinition(definition: ModuleUiDefinition): ModuleUiDefinition {
  return { ...definition, label: msgText(definition.labelKey) }
}

export function fallbackModuleState(definition: ModuleUiDefinition): ModuleCardState {
  const availability = definition.defaultEnabled ? 'active' : 'notConfigured'
  return { definition, id: definition.id, availability, root: null, detail: null }
}

export function mergeResolvedModules(
  definitions: ModuleUiDefinition[],
  resolved: ResolvedIntegration[]
): ModuleCardState[] {
  const byId = new Map<IntegrationId, ResolvedIntegration>()
  resolved.forEach((item) => byId.set(item.id, item))
  return definitions.map((definition) => ({ ...fallbackModuleState(definition), ...byId.get(definition.id), definition }))
}
