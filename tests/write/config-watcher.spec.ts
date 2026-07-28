import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox } from './fixtures'
import {
  classifyConfigPath,
  shouldIgnoreConfigPath,
  startConfigWatcher,
  stopConfigWatcher
} from '../../src/main/services/config-watcher'
import {
  getConfigScanCacheMeta,
  getConfigSnapshot,
  resetConfigScanCache
} from '../../src/main/services/config-scan-cache'
import type { ConfigChangedPayload } from '../../shared/contract-watcher-fs'

function resetEnv(): void {
  delete process.env.RAWALLM_SANDBOX_ROOT
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test.afterEach(() => {
  stopConfigWatcher()
  resetConfigScanCache()
  resetEnv()
})

test('Pfad-Ableitung liefert Familie und RootKind aus Sandbox-Roots', () => {
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  expect(classifyConfigPath(join(sb.root, '.claude', 'settings.json'))).toEqual({
    family: 'claude',
    rootKind: 'userglobal'
  })
  expect(classifyConfigPath(join(sb.root, '.codex', 'config.toml'))).toEqual({
    family: 'codex',
    rootKind: 'userglobal'
  })
  expect(classifyConfigPath(join(sb.root, '.shared', '.claude', 'rules', 'x.md'))).toEqual({
    family: 'shared',
    rootKind: 'shared'
  })
  expect(classifyConfigPath(join(sb.root, 'project', 'AGENTS.md'))).toEqual({
    family: 'local',
    rootKind: 'project'
  })
})

test('Ignore-Liste filtert Build-, Git-, Log-, Temp- und Lock-Dateien', () => {
  expect(shouldIgnoreConfigPath(join('x', 'node_modules', 'pkg', 'index.js'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', '.git', 'HEAD'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'build', 'bundle.js'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'audit-log.ndjson'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'run.log'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'pnpm-lock.yaml'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'settings.json'))).toBe(false)
})

test('Ignore-Liste filtert Session-/DB-Journals und Build-Outputs (Hang-Regression 2026-07-27)', () => {
  // Laufende Agenten-Sessions schreiben dauerhaft .jsonl/.sqlite-wal — ohne
  // Ignore loest jede Zeile einen Scan-Invalidierungs-Reload aus.
  expect(shouldIgnoreConfigPath(join('x', 'projects', 'session.jsonl'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'history.jsonl'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'goals_1.sqlite'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'goals_1.sqlite-wal'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'goals_1.sqlite-shm'))).toBe(true)
  // Eigene Build-/Export-Outputs des beobachteten Projekt-Repos.
  expect(shouldIgnoreConfigPath(join('x', 'out', 'main', 'index.js'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'dist-release', 'app.asar'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'design-export-teil-f', 'shot.png'))).toBe(true)
  expect(shouldIgnoreConfigPath(join('x', 'test-results', 'last-run.json'))).toBe(true)
  // Echte Config bleibt beobachtet.
  expect(shouldIgnoreConfigPath(join('x', 'settings.json'))).toBe(false)
  expect(shouldIgnoreConfigPath(join('x', 'AGENTS.md'))).toBe(false)
})

test('Watcher buendelt mehrere Aenderungen zu einem Metadaten-Payload', async () => {
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const root = join(sb.root, '.claude')
  mkdirSync(root, { recursive: true })
  const sent: ConfigChangedPayload[] = []
  const win = {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, payload: ConfigChangedPayload) => sent.push(payload) }
  }
  startConfigWatcher(() => win as never, { roots: [root], debounceMs: 350 })
  await wait(700)
  writeFileSync(join(root, 'settings.json'), '{}', 'utf8')
  writeFileSync(join(root, 'config.json'), '{}', 'utf8')
  await wait(900)
  expect(sent).toHaveLength(1)
  expect(Object.keys(sent[0]).sort()).toEqual(['at', 'families', 'reason', 'rootKinds'])
  expect(sent[0].families).toEqual(['claude'])
  expect(sent[0].rootKinds).toEqual(['userglobal'])
  expect(sent[0].reason).toBe('fs-change')
})

test('Watcher-Invalidierung ist gedebounced: Cache bleibt bis zum Flush frisch', async () => {
  // Regression 2026-07-27 (Start-Haenger): markScanCachesStale lief pro Event
  // VOR dem Debounce — bei Eventflut war der Cache permanent stale und jeder
  // Renderer-Reload wurde zum synchronen Vollscan. Erwartung: das Event allein
  // invalidiert nicht; erst der debouncte Flush tut es.
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const root = join(sb.root, '.claude')
  mkdirSync(root, { recursive: true })
  resetConfigScanCache()
  await getConfigSnapshot({ reason: 'test-prime' })
  expect(getConfigScanCacheMeta()?.status).toBe('scan')
  const win = {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, _payload: ConfigChangedPayload) => {} }
  }
  startConfigWatcher(() => win as never, { roots: [root], debounceMs: 2000 })
  await wait(700)
  writeFileSync(join(root, 'settings.json'), '{}', 'utf8')
  await wait(700) // Event ist da (awaitWriteFinish ~250 ms), Flush noch nicht
  await getConfigSnapshot()
  expect(getConfigScanCacheMeta()?.status).toBe('hit') // kein Re-Scan pro Event
  await wait(1700) // Flush (Event + 2000 ms Debounce) ist gelaufen
  await getConfigSnapshot()
  const meta = getConfigScanCacheMeta()
  expect(meta?.status).toBe('scan')
  expect(meta?.reason).toBe('fs-change')
})

test('Watcher ignoriert ausgeschlossene Pfade und stoppt ohne Spaet-Push', async () => {
  const sb = makeSandbox()
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  const root = join(sb.root, '.claude')
  mkdirSync(root, { recursive: true })
  const sent: ConfigChangedPayload[] = []
  const win = {
    isDestroyed: () => false,
    webContents: { send: (_channel: string, payload: ConfigChangedPayload) => sent.push(payload) }
  }
  startConfigWatcher(() => win as never, { roots: [root], debounceMs: 80 })
  await wait(700)
  writeFileSync(join(root, 'audit-log.ndjson'), '{}', 'utf8')
  await wait(900)
  expect(sent).toHaveLength(0)
  writeFileSync(join(root, 'settings.json'), '{}', 'utf8')
  stopConfigWatcher()
  await wait(900)
  expect(sent).toHaveLength(0)
})
