// integration-store.spec.ts — Integrations-Store gegen temp-Sandbox.
// Prueft Defaults, Persistenz, graceful Read-Fallbacks und optionale Module aus.
import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createIntegrationStore,
  defaultIntegrationActivations,
  readIntegrationActivationsSync
} from '../../src/main/services/integration-store'
import { makeSandbox, assertNotRealHome, type Sandbox } from './fixtures'

function storePath(sb: Sandbox): string {
  const target = join(sb.configDir, 'integrations.json')
  assertNotRealHome(target)
  return target
}

test('frischer Store: core und user-sources aktiv, optionale Module aus', async () => {
  const store = createIntegrationStore({ storePath: storePath(makeSandbox()) })
  const integrations = await store.listIntegrations()
  expect(integrations).toEqual(defaultIntegrationActivations())
  expect(integrations.filter((item) => item.enabled).map((item) => item.id)).toEqual(['core', 'user-sources'])
})

test('setActivation persistiert enabled, paused und root', async () => {
  const path = storePath(makeSandbox())
  const store = createIntegrationStore({ storePath: path })
  const out = await store.setActivation({
    id: 'graphify',
    enabled: true,
    paused: true,
    root: 'D:\\Graphify'
  })
  expect(out.ok).toBe(true)
  const persisted = readIntegrationActivationsSync(path).find((item) => item.id === 'graphify')
  expect(persisted).toMatchObject({ enabled: true, paused: true, root: 'D:\\Graphify' })
  expect(persisted?.updatedAt).not.toBe('1970-01-01T00:00:00.000Z')
})

test('fehlende Datei liefert Defaults graceful', () => {
  const path = join(makeSandbox().configDir, 'missing-integrations.json')
  assertNotRealHome(path)
  expect(readIntegrationActivationsSync(path)).toEqual(defaultIntegrationActivations())
})

test('kaputte Datei liefert Defaults graceful', () => {
  const path = storePath(makeSandbox())
  writeFileSync(path, '{kaputt', 'utf8')
  expect(readIntegrationActivationsSync(path)).toEqual(defaultIntegrationActivations())
})

test('optionale Defaults bleiben disabled', async () => {
  const store = createIntegrationStore({ storePath: storePath(makeSandbox()) })
  const optional = (await store.listIntegrations()).filter((item) => item.id !== 'core' && item.id !== 'user-sources')
  expect(optional.map((item) => item.enabled)).toEqual([false, false, false, false, false])
  expect(optional.map((item) => item.paused)).toEqual([false, false, false, false, false])
})
