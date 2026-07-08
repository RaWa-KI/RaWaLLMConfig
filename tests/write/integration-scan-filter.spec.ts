import { test, expect } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IntegrationActivation } from '../../shared/contract-integrations'

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (k.includes('/src/main/scan/') || k.includes('/src/main/services/') || k.includes('/shared/contract')) {
      delete require.cache[key]
    }
  }
}

function loadScanAll(): () => { llms: Array<{ id: string }>, data: Record<string, { categories: unknown[]; scanError?: string }> } {
  bustScanCache()
  /* eslint-disable @typescript-eslint/no-var-requires */
  return (require('../../src/main/scan/scan-index') as {
    scanAll: () => { llms: Array<{ id: string }>, data: Record<string, { categories: unknown[]; scanError?: string }> }
  }).scanAll
  /* eslint-enable @typescript-eslint/no-var-requires */
}

function activation(root: string, enabled: boolean): IntegrationActivation {
  return {
    id: 'shared-trunk',
    enabled,
    paused: false,
    root: join(root, '.shared', '.claude'),
    updatedAt: '2026-07-07T00:00:00.000Z'
  }
}

function writeIntegrations(root: string, shared: IntegrationActivation): void {
  const state: IntegrationActivation[] = [
    { id: 'core', enabled: true, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'user-sources', enabled: true, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    shared,
    { id: 'workspace-registry', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'graphify', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'obsidian', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'watcher-governance', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' }
  ]
  writeFileSync(join(root, 'integrations.json'), JSON.stringify(state, null, 2), 'utf8')
}

test('fresh user ohne aktiviertes Shared: kein Shared-Scan und kein Shared-Tab', () => {
  const root = join(tmpdir(), `rawallm-filter-off-${process.pid}`)
  mkdirSync(join(root, '.claude'), { recursive: true })
  mkdirSync(join(root, '.codex'), { recursive: true })
  mkdirSync(join(root, 'project'), { recursive: true })
  process.env.RAWALLM_SANDBOX_ROOT = root
  try {
    const appData = loadScanAll()()
    expect(appData.data.shared.scanError).toBeUndefined()
    expect(appData.data.shared.categories).toEqual([])
    expect(appData.llms.some((item) => item.id === 'shared')).toBe(false)
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
    bustScanCache()
  }
})

test('aktiviertes Shared scannt den gewaehlten Root', () => {
  const root = join(tmpdir(), `rawallm-filter-on-${process.pid}`)
  const shared = join(root, '.shared', '.claude')
  mkdirSync(join(shared, 'agents'), { recursive: true })
  writeFileSync(join(shared, 'agents', 'demo.md'), '# Demo\n', 'utf8')
  mkdirSync(join(root, '.claude'), { recursive: true })
  mkdirSync(join(root, '.codex'), { recursive: true })
  mkdirSync(join(root, 'project'), { recursive: true })
  writeIntegrations(root, activation(root, true))
  process.env.RAWALLM_SANDBOX_ROOT = root
  try {
    const appData = loadScanAll()()
    expect(appData.data.shared.scanError).toBeUndefined()
    expect(appData.data.shared.categories.length).toBeGreaterThan(0)
    expect(appData.llms.some((item) => item.id === 'shared')).toBe(true)
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
    bustScanCache()
  }
})
