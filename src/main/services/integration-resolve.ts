import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  IntegrationActivation,
  IntegrationAvailability,
  IntegrationDefinition,
  IntegrationId,
  ResolvedIntegration
} from '@shared/contract-integrations'
import { defaultIntegrationActivations } from './integration-store'
import { listIntegrationDefinitions } from './integration-registry'
import { configRoots } from './config-roots'

export type IntegrationExists = (root: string, definition: IntegrationDefinition) => boolean
type IntegrationPathStatus = 'available' | 'missing' | 'unavailable'

type IntegrationProbe = (input: {
  activation: IntegrationActivation
  definition: IntegrationDefinition
  exists: IntegrationExists
}) => IntegrationAvailability

export interface ResolveIntegrationsOptions {
  definitions?: IntegrationDefinition[]
  activations?: IntegrationActivation[]
  exists?: IntegrationExists
  probes?: Partial<Record<IntegrationId, IntegrationProbe>>
}

const ACTIVE_DETAIL = 'Aktiv'
const FOUND_DETAIL = 'Gefunden'
const PAUSED_DETAIL = 'Pausiert'
const NOT_CONFIGURED_DETAIL = 'Nicht eingerichtet'
const UNAVAILABLE_DETAIL = 'Nicht verfuegbar'

export function resolveIntegrations(opts: ResolveIntegrationsOptions = {}): ResolvedIntegration[] {
  const definitions = opts.definitions ?? listIntegrationDefinitions()
  const activationById = toActivationMap(opts.activations ?? defaultIntegrationActivations())
  const exists = opts.exists ?? ((root) => pathStatus(root) === 'available')

  return definitions.map((definition) => {
    const activation = withKnownRoot(definition, activationById.get(definition.id) ?? activationFromDefinition(definition), Boolean(opts.exists))
    const availability = resolveAvailability(definition, activation, exists, Boolean(opts.exists), opts.probes?.[definition.id])
    return {
      id: definition.id,
      availability,
      root: activation.root,
      detail: detailForAvailability(availability)
    }
  })
}

function withKnownRoot(
  definition: IntegrationDefinition,
  activation: IntegrationActivation,
  hasCustomExists: boolean
): IntegrationActivation {
  if (hasCustomExists || definition.id !== 'shared-trunk' || activation.root) return activation
  const sharedRoot = configRoots().sharedClaude
  if (!sharedRoot) return activation
  return pathStatus(sharedRoot) === 'available' ? { ...activation, root: sharedRoot } : activation
}

function toActivationMap(activations: IntegrationActivation[]): Map<IntegrationId, IntegrationActivation> {
  return new Map(activations.map((activation) => [activation.id, activation]))
}

function activationFromDefinition(definition: IntegrationDefinition): IntegrationActivation {
  return {
    id: definition.id,
    enabled: definition.defaultEnabled,
    paused: false,
    root: null,
    updatedAt: '1970-01-01T00:00:00.000Z'
  }
}

function resolveAvailability(
  definition: IntegrationDefinition,
  activation: IntegrationActivation,
  exists: IntegrationExists,
  hasCustomExists: boolean,
  probe?: IntegrationProbe
): IntegrationAvailability {
  if (definition.core) return 'active'
  if (activation.paused) return 'paused'
  if (definition.probeKind === 'none') return activation.enabled ? 'active' : 'notConfigured'
  if (!activation.root) return 'notConfigured'
  if (probe) return probe({ activation, definition, exists })
  if (hasCustomExists) return exists(activation.root, definition) ? activeOrFound(activation) : 'notConfigured'
  const status = pathStatus(activation.root)
  if (status !== 'available') return status === 'unavailable' ? 'unavailable' : 'notConfigured'
  // graphify: die blosse Existenz des Roots sagt nichts — es zaehlt, ob darunter
  // wirklich graphify-Daten liegen. Ein als Workspace-Parent gesetzter Root ist
  // damit verfuegbar, sobald EIN <WS>/graphify-out existiert (F8).
  if (definition.probeKind === 'graph' && !hasGraphifyData(activation.root)) return 'notConfigured'
  return activeOrFound(activation)
}

/**
 * graphify-Daten unter einem Root: entweder <root>/graphify-out selbst
 * (Abwaertskompatibilitaet: Root zeigt direkt auf einen Workspace) oder
 * mindestens ein <root>/<WS>/graphify-out (Root ist der Workspace-Parent).
 */
function hasGraphifyData(root: string): boolean {
  if (pathStatus(join(root, 'graphify-out')) === 'available') return true
  let children: string[]
  try {
    children = readdirSync(root)
  } catch {
    return false
  }
  return children.some((name) => pathStatus(join(root, name, 'graphify-out')) === 'available')
}

function activeOrFound(activation: IntegrationActivation): IntegrationAvailability {
  return activation.enabled ? 'active' : 'found'
}

function pathStatus(root: string): IntegrationPathStatus {
  if (!existsSync(root)) return 'missing'
  try {
    const stat = statSync(root)
    accessSync(root, constants.R_OK)
    return stat.isDirectory() ? 'available' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

function detailForAvailability(availability: IntegrationAvailability): string {
  switch (availability) {
    case 'active':
      return ACTIVE_DETAIL
    case 'found':
      return FOUND_DETAIL
    case 'paused':
      return PAUSED_DETAIL
    case 'notConfigured':
      return NOT_CONFIGURED_DETAIL
    case 'unavailable':
      return UNAVAILABLE_DETAIL
  }
}
