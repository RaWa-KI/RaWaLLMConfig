// source-store.spec.ts — portabler Quellen-Store (WP-C1) gegen temp-Sandbox.
// Prueft: CRUD (add/remove/setEnabled), onboardingDone-Toggle, backup-first beim
// Overwrite, Duplikat-root-Idempotenz, sowie readEnabledSourceRootsSync (nur
// enabled roots, injizierter Pfad -> KEIN app.getPath). Reine temp-Sandbox, NIE
// reale Config; kein Electron-app-Aufruf (storePath stets injiziert).
import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CURRENT_ONBOARDING_VERSION,
  createSourceStore,
  readEnabledSourceRootsByProviderSync,
  readEnabledSourceRootsSync
} from '../../src/main/services/source-store'
import { makeSandbox, assertNotRealHome, type Sandbox } from './fixtures'

function storeOpts(sb: Sandbox): { storePath: string; archiveRoot: string; auditPath: string } {
  const storePath = join(sb.configDir, 'sources.json')
  assertNotRealHome(storePath)
  return { storePath, archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

function sourcePath(sb: Sandbox, name: string): string {
  return join(sb.configDir, 'sources', name)
}

test('frischer Store: leerer Default ohne Datei (kein Crash)', async () => {
  const store = createSourceStore(storeOpts(makeSandbox()))
  expect(await store.listSources()).toEqual([])
  expect(await store.getOnboardingDone()).toBe(false)
})

test('add -> list zeigt Eintrag (id/label/enabled Default)', async () => {
  const sb = makeSandbox()
  const store = createSourceStore(storeOpts(sb))
  const root = sourcePath(sb, 'MyClaude')
  const out = await store.addSource({ root, providerId: 'claude' })
  expect(out.ok).toBe(true)
  expect(out.sources).toHaveLength(1)
  const s = out.sources[0]
  expect(s.root).toBe(root)
  expect(s.label).toBe('MyClaude')
  expect(s.enabled).toBe(true)
  expect(s.id.length).toBeGreaterThan(0)
  expect(await store.listSources()).toHaveLength(1)
})

test('Duplikat-root wird plattformgerecht erkannt', async () => {
  const store = createSourceStore(storeOpts(makeSandbox()))
  await store.addSource({ root: 'D:\\Tools\\Dup', providerId: 'claude' })
  const out = await store.addSource({ root: 'd:\\tools\\dup', providerId: 'codex' })
  expect(out.ok).toBe(true)
  expect(out.sources).toHaveLength(process.platform === 'win32' ? 1 : 2)
})

test('remove entfernt die Quelle', async () => {
  const store = createSourceStore(storeOpts(makeSandbox()))
  const added = await store.addSource({ root: 'D:\\Tools\\Gone', providerId: 'codex' })
  const id = added.sources[0].id
  const out = await store.removeSource(id)
  expect(out.ok).toBe(true)
  expect(out.sources).toHaveLength(0)
  expect(await store.listSources()).toEqual([])
})

test('setEnabled schaltet eine Quelle aus', async () => {
  const store = createSourceStore(storeOpts(makeSandbox()))
  const added = await store.addSource({ root: 'D:\\Tools\\Tog', providerId: 'claude' })
  const id = added.sources[0].id
  const out = await store.setSourceEnabled({ id, enabled: false })
  expect(out.ok).toBe(true)
  expect(out.sources[0].enabled).toBe(false)
})

test('onboardingDone toggelt + persistiert', async () => {
  const opts = storeOpts(makeSandbox())
  const store = createSourceStore(opts)
  expect(await store.getOnboardingDone()).toBe(false)
  const out = await store.setOnboardingDone(true)
  expect(out.ok).toBe(true)
  expect(await store.getOnboardingDone()).toBe(true)
  const raw = JSON.parse(readFileSync(opts.storePath, 'utf8')) as { onboardingVersion?: number }
  expect(raw.onboardingVersion).toBe(CURRENT_ONBOARDING_VERSION)
})

test('Legacy-Store version 1 mit onboardingDone:true gilt nicht als aktuelles Onboarding', async () => {
  const opts = storeOpts(makeSandbox())
  writeFileSync(opts.storePath, JSON.stringify({ version: 1, sources: [], onboardingDone: true }), 'utf8')
  const store = createSourceStore(opts)
  expect(await store.getOnboardingDone()).toBe(false)
})

test('setOnboardingDone(false) setzt Version zurueck, damit Onboarding erscheint', async () => {
  const opts = storeOpts(makeSandbox())
  const store = createSourceStore(opts)
  await store.setOnboardingDone(true)
  const out = await store.setOnboardingDone(false)
  expect(out.ok).toBe(true)
  expect(await store.getOnboardingDone()).toBe(false)
  const raw = JSON.parse(readFileSync(opts.storePath, 'utf8')) as { onboardingVersion?: number }
  expect(raw.onboardingVersion).toBe(0)
})

test('zweite Mutation macht backup-first (Pre-Snapshot der alten Datei)', async () => {
  const store = createSourceStore(storeOpts(makeSandbox()))
  await store.addSource({ root: 'D:\\Tools\\First', providerId: 'claude' }) // legt Datei an
  const out = await store.addSource({ root: 'D:\\Tools\\Second', providerId: 'codex' }) // Overwrite
  expect(out.ok).toBe(true)
  expect(out.backupPath).toBeTruthy()
  expect(existsSync(out.backupPath!)).toBe(true)
})

test('readEnabledSourceRootsSync: nur enabled roots, injizierter Pfad (kein app.getPath)', async () => {
  const opts = storeOpts(makeSandbox())
  const store = createSourceStore(opts)
  const a = await store.addSource({ root: 'D:\\Tools\\On', providerId: 'claude' })
  await store.addSource({ root: 'D:\\Tools\\Off', providerId: 'codex' })
  // zweite Quelle ausschalten
  const offId = a.sources.length ? (await store.listSources()).find((s) => s.root === 'D:\\Tools\\Off')!.id : ''
  await store.setSourceEnabled({ id: offId, enabled: false })
  const roots = readEnabledSourceRootsSync(opts.storePath)
  expect(roots).toEqual(['D:\\Tools\\On'])
})

test('readEnabledSourceRootsSync: fehlende Datei -> [] (graceful)', () => {
  const sb = makeSandbox()
  expect(readEnabledSourceRootsSync(join(sb.configDir, 'fehlt.json'))).toEqual([])
})

test('readEnabledSourceRootsByProviderSync: gruppiert enabled roots nach providerId', async () => {
  const opts = storeOpts(makeSandbox())
  const store = createSourceStore(opts)
  await store.addSource({ root: 'D:\\Tools\\ClaudeA', providerId: 'claude' })
  const added = await store.addSource({ root: 'D:\\Tools\\CodexA', providerId: 'codex' })
  const codexId = added.sources.find((s) => s.root === 'D:\\Tools\\CodexA')!.id
  await store.setSourceEnabled({ id: codexId, enabled: false })
  expect(readEnabledSourceRootsByProviderSync(opts.storePath)).toEqual({ claude: ['D:\\Tools\\ClaudeA'] })
})
