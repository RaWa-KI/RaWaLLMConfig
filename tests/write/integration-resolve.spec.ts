import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { IntegrationActivation, IntegrationId } from '../../shared/contract-integrations'
import { listIntegrationDefinitions } from '../../src/main/services/integration-registry'
import { resolveIntegrations, type IntegrationExists } from '../../src/main/services/integration-resolve'
import { defaultIntegrationActivations } from '../../src/main/services/integration-store'

const OPTIONAL_IDS: IntegrationId[] = [
  'shared-trunk',
  'workspace-registry',
  'graphify',
  'obsidian',
  'watcher-governance'
]

function activationPatch(id: IntegrationId, patch: Partial<IntegrationActivation>): IntegrationActivation[] {
  return defaultIntegrationActivations().map((activation) => (
    activation.id === id ? { ...activation, ...patch } : activation
  ))
}

function existsFor(foundRoots: string[]): IntegrationExists {
  return (root) => foundRoots.includes(root)
}

test('Registry liefert Hub-Modulkarte in stabiler Reihenfolge', () => {
  expect(listIntegrationDefinitions().map(({ id, label, defaultEnabled }) => ({ id, label, defaultEnabled }))).toEqual([
    { id: 'core', label: 'Grundfunktionen', defaultEnabled: true },
    { id: 'user-sources', label: 'Eigene Ordner', defaultEnabled: true },
    { id: 'shared-trunk', label: 'Gemeinsame Regeln', defaultEnabled: false },
    { id: 'workspace-registry', label: 'Arbeitsbereiche', defaultEnabled: false },
    { id: 'graphify', label: 'Wissensnetz', defaultEnabled: false },
    { id: 'obsidian', label: 'Notizen', defaultEnabled: false },
    { id: 'watcher-governance', label: 'Wartung & Hinweise', defaultEnabled: false }
  ])
})

test('Fresh-User-Fixture: optionale Module sind notConfigured, Core und eigene Ordner aktiv', () => {
  const resolved = resolveIntegrations({ exists: existsFor([]) })
  expect(resolved.find((item) => item.id === 'core')?.availability).toBe('active')
  expect(resolved.find((item) => item.id === 'user-sources')?.availability).toBe('active')
  expect(resolved.filter((item) => OPTIONAL_IDS.includes(item.id)).map((item) => item.availability)).toEqual([
    'notConfigured',
    'notConfigured',
    'notConfigured',
    'notConfigured',
    'notConfigured'
  ])
})

test('Vorhandener optionaler Pfad ohne Aktivierung wird als found gemeldet', () => {
  const root = 'D:\\Shared\\.claude'
  const resolved = resolveIntegrations({
    activations: activationPatch('shared-trunk', { root }),
    exists: existsFor([root])
  })
  expect(resolved.find((item) => item.id === 'shared-trunk')).toMatchObject({
    availability: 'found',
    root
  })
})

test('Aktivierter vorhandener optionaler Pfad wird active', () => {
  const root = 'D:\\Graphify'
  const resolved = resolveIntegrations({
    activations: activationPatch('graphify', { enabled: true, root }),
    exists: existsFor([root])
  })
  expect(resolved.find((item) => item.id === 'graphify')?.availability).toBe('active')
})

test('Pausiert gewinnt vor Pfad-Probe', () => {
  const root = 'D:\\Obsidian'
  const resolved = resolveIntegrations({
    activations: activationPatch('obsidian', { enabled: true, paused: true, root }),
    exists: existsFor([root])
  })
  expect(resolved.find((item) => item.id === 'obsidian')?.availability).toBe('paused')
})

test('Fehlender optionaler Root bleibt neutral notConfigured', () => {
  const resolved = resolveIntegrations({
    activations: activationPatch('watcher-governance', { enabled: true, root: 'D:\\Reports' }),
    exists: existsFor([])
  })
  expect(resolved.find((item) => item.id === 'watcher-governance')?.availability).toBe('notConfigured')
})

test('Vorhandener aber ungeeigneter optionaler Root wird unavailable', () => {
  const root = writeFilePath()
  const resolved = resolveIntegrations({
    activations: activationPatch('workspace-registry', { enabled: true, root })
  })
  expect(resolved.find((item) => item.id === 'workspace-registry')).toMatchObject({
    availability: 'unavailable',
    root,
    detail: 'Nicht verfuegbar'
  })
})

test('Injizierte Modul-Probe kann unavailable melden', () => {
  const root = 'D:\\Registry'
  const resolved = resolveIntegrations({
    activations: activationPatch('workspace-registry', { enabled: true, root }),
    exists: existsFor([root]),
    probes: {
      'workspace-registry': () => 'unavailable'
    }
  })
  expect(resolved.find((item) => item.id === 'workspace-registry')?.availability).toBe('unavailable')
})

function writeFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rawallmconfig-integration-root-'))
  const file = join(dir, 'not-a-directory.txt')
  writeFileSync(file, 'not a module directory', 'utf8')
  return file
}
