// integration-store.ts — persistiert Modul-Aktivierungen als JSON-Array.
// Kein Auto-mkdir: fehlende Zielordner bleiben ein Write-Fehler, Reads fallen
// graceful auf Defaults zurueck. Electron app.getPath wird nur lazy genutzt.
import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { IntegrationActivation, IntegrationId } from '@shared/contract-integrations'

const DEFAULT_UPDATED_AT = '1970-01-01T00:00:00.000Z'

const INTEGRATION_IDS: IntegrationId[] = [
  'core',
  'user-sources',
  'shared-trunk',
  'workspace-registry',
  'graphify',
  'obsidian',
  'watcher-governance'
]

const DEFAULT_ENABLED = new Set<IntegrationId>(['core', 'user-sources'])

export interface IntegrationStoreOptions {
  storePath?: string
}

export interface SetIntegrationActivationRequest {
  id: IntegrationId
  enabled?: boolean
  paused?: boolean
  root?: string | null
}

export interface IntegrationStoreResult {
  ok: boolean
  error: string | null
  integrations: IntegrationActivation[]
}

export function defaultIntegrationsPath(): string {
  return join(app.getPath('userData'), 'integrations.json')
}

export function defaultIntegrationActivations(): IntegrationActivation[] {
  return INTEGRATION_IDS.map((id) => ({
    id,
    enabled: DEFAULT_ENABLED.has(id),
    paused: false,
    root: null,
    updatedAt: DEFAULT_UPDATED_AT
  }))
}

function normalizeState(input: unknown): IntegrationActivation[] {
  const byId = new Map<IntegrationId, Partial<IntegrationActivation>>()
  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== 'object') continue
      const candidate = item as Partial<IntegrationActivation>
      if (!candidate.id || !INTEGRATION_IDS.includes(candidate.id)) continue
      byId.set(candidate.id, candidate)
    }
  }
  return defaultIntegrationActivations().map((base) => {
    const stored = byId.get(base.id)
    if (!stored) return base
    return {
      id: base.id,
      enabled: typeof stored.enabled === 'boolean' ? stored.enabled : base.enabled,
      paused: typeof stored.paused === 'boolean' ? stored.paused : base.paused,
      root: typeof stored.root === 'string' || stored.root === null ? stored.root : base.root,
      updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : base.updatedAt
    }
  })
}

function readState(storePath: string): IntegrationActivation[] {
  try {
    if (!existsSync(storePath)) return defaultIntegrationActivations()
    return normalizeState(JSON.parse(readFileSync(storePath, 'utf8')))
  } catch {
    return defaultIntegrationActivations()
  }
}

function atomicWriteJson(targetPath: string, data: IntegrationActivation[]): void {
  const tmp = `${targetPath}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, targetPath)
}

export function createIntegrationStore(opts?: IntegrationStoreOptions) {
  const storePath = opts?.storePath ?? defaultIntegrationsPath()

  function persist(next: IntegrationActivation[]): IntegrationStoreResult {
    try {
      atomicWriteJson(storePath, next)
      return { ok: true, error: null, integrations: next }
    } catch {
      return { ok: false, error: 'integration-write-failed', integrations: readState(storePath) }
    }
  }

  return {
    async listIntegrations(): Promise<IntegrationActivation[]> {
      return readState(storePath)
    },
    async setActivation(req: SetIntegrationActivationRequest): Promise<IntegrationStoreResult> {
      const state = readState(storePath)
      let changed = false
      const now = new Date().toISOString()
      const next = state.map((item) => {
        if (item.id !== req.id) return item
        const updated = {
          ...item,
          enabled: req.enabled ?? item.enabled,
          paused: req.paused ?? item.paused,
          root: req.root === undefined ? item.root : req.root,
          updatedAt: now
        }
        changed = JSON.stringify(updated) !== JSON.stringify(item)
        return updated
      })
      return changed ? persist(next) : { ok: true, error: null, integrations: state }
    }
  }
}

export function readIntegrationActivationsSync(storePath?: string): IntegrationActivation[] {
  return readState(storePath ?? defaultIntegrationsPath())
}
