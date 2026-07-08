// shared/contract-integrations.ts (fixiert 2026-07-06, Hub)
export type IntegrationId =
  | 'core' | 'user-sources' | 'shared-trunk' | 'workspace-registry'
  | 'graphify' | 'obsidian' | 'watcher-governance'

export type IntegrationAvailability =
  | 'notConfigured' | 'found' | 'active' | 'paused' | 'unavailable'

export interface IntegrationDefinition {
  id: IntegrationId
  label: string              // Nutzerlabel aus Modulkarte, deutsch
  core: boolean              // true = kein Schalter, immer aktiv
  defaultEnabled: boolean
  probeKind: 'path' | 'registry' | 'graph' | 'vault' | 'reports' | 'none'
}

export interface IntegrationActivation {
  id: IntegrationId
  enabled: boolean
  paused: boolean
  root: string | null        // vom Nutzer gewaehlter Pfad; nie automatisch angelegt
  updatedAt: string          // ISO-Zeitstempel
}

export interface ResolvedIntegration {
  id: IntegrationId
  availability: IntegrationAvailability
  root: string | null
  detail: string | null      // lesbare, wertfreie Statuszeile fuer die UI
}
