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
import type { ConfigChangedPayload } from '../../shared/contract-watcher-fs'

function resetEnv(): void {
  delete process.env.RAWALLM_SANDBOX_ROOT
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test.afterEach(() => {
  stopConfigWatcher()
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
