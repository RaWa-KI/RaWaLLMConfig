import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { IntegrationId, ResolvedIntegration } from '@shared/contract-integrations'
import { resolveIntegrations } from '../services/integration-resolve'
import { readIntegrationActivationsSync } from '../services/integration-store'
import { userDataRoot } from '../services/app-paths'

const PROVIDER_INTEGRATION: Record<string, IntegrationId | undefined> = {
  shared: 'shared-trunk'
}

function storePath(): string {
  return join(userDataRoot(), 'integrations.json')
}

function resolvedIntegrations(): ResolvedIntegration[] {
  return resolveIntegrations({
    activations: readIntegrationActivationsSync(storePath()),
    exists: (root) => existsSync(root)
  })
}

function providerIntegration(providerId?: string): ResolvedIntegration | null {
  const integrationId = providerId ? PROVIDER_INTEGRATION[providerId] : undefined
  if (!integrationId) return null
  return resolvedIntegrations().find((item) => item.id === integrationId) ?? null
}

export function isProviderScanEnabled(providerId: string): boolean {
  const integration = providerIntegration(providerId)
  return integration ? integration.availability === 'active' : true
}

export function filterProviderRoots(providerId: string | undefined, roots: string[]): string[] {
  const integration = providerIntegration(providerId)
  if (!integration) return roots
  if (integration.availability !== 'active') return []
  return integration.root ? [integration.root] : roots
}
