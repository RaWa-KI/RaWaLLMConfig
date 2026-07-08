import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IntegrationActivation, IntegrationId, ResolvedIntegration } from '../../shared/contract-integrations'
import { buildGraphIngestAll } from '../../src/main/scan/graphify-ingest'
import { handleReadIgnores } from '../../src/main/ipc-write-ignore'
import { resolveIntegrations, type IntegrationExists } from '../../src/main/services/integration-resolve'
import { defaultIntegrationActivations } from '../../src/main/services/integration-store'
import { makeSandbox } from './fixtures'

function activationPatch(id: IntegrationId, patch: Partial<IntegrationActivation>): IntegrationActivation[] {
  return defaultIntegrationActivations().map((activation) => (
    activation.id === id ? { ...activation, ...patch } : activation
  ))
}

function existsFor(foundRoots: string[]): IntegrationExists {
  return (root) => foundRoots.includes(root)
}

function setSandboxEnv(root: string): () => void {
  const saved = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = root
  return () => {
    if (saved === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = saved
  }
}

function seedWorkspaceRegistry(sandboxRoot: string): string {
  const wsRoot = join(sandboxRoot, 'project')
  const registryDir = join(sandboxRoot, '.shared', '.claude', 'coordination', 'registry')
  mkdirSync(registryDir, { recursive: true })
  mkdirSync(wsRoot, { recursive: true })
  writeFileSync(
    join(registryDir, 'workspaces.json'),
    JSON.stringify({ workspaces: { test: { name: 'Test', path_local: wsRoot } } }),
    'utf8'
  )
  return wsRoot
}

function graphModuleIntegrations(graphRoot: string): ResolvedIntegration[] {
  return resolveIntegrations({
    activations: activationPatch('graphify', { enabled: true, root: graphRoot }),
    exists: existsFor([graphRoot])
  })
}

test('Graphify-Ingest laeuft ohne Obsidian-Modul und meldet Obsidian neutral', () => {
  const sb = makeSandbox()
  const wsRoot = join(sb.root, 'graph-ws')
  mkdirSync(join(wsRoot, 'graphify-out'), { recursive: true })
  writeFileSync(
    join(wsRoot, 'graphify-out', 'graph.json'),
    JSON.stringify({ nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] }),
    'utf8'
  )

  const result = buildGraphIngestAll(
    [{ root: wsRoot, label: 'Graph WS' }],
    graphModuleIntegrations(wsRoot)
  )

  expect(result.modules.graphify.availability).toBe('active')
  expect(result.modules.obsidian.availability).toBe('notConfigured')
  expect(result.workspaces).toHaveLength(1)
  expect(result.workspaces[0].placeholder).toBe(false)
})

test('Obsidian-Ignores laufen ohne Graphify-Modul und melden Graphify neutral', () => {
  const sb = makeSandbox()
  const sandboxRoot = join(sb.root, 'obsidian-sandbox')
  const restore = setSandboxEnv(sandboxRoot)
  try {
    const wsRoot = seedWorkspaceRegistry(sandboxRoot)
    mkdirSync(join(wsRoot, '.obsidian'), { recursive: true })
    writeFileSync(join(wsRoot, '.obsidian', 'app.json'), JSON.stringify({ userIgnoreFilters: ['tmp'] }), 'utf8')
    const integrations = resolveIntegrations({
      activations: activationPatch('obsidian', { enabled: true, root: join(wsRoot, '.obsidian') }),
      exists: existsFor([join(wsRoot, '.obsidian')])
    })

    const result = handleReadIgnores(wsRoot, integrations)

    expect(result.error).toBeNull()
    expect(result.data?.modules.obsidian.availability).toBe('active')
    expect(result.data?.modules.graphify.availability).toBe('notConfigured')
    expect(result.data?.obsidian.content).toBe('tmp')
    expect(result.data?.graphify.availability).toBe('notConfigured')
  } finally {
    restore()
  }
})
