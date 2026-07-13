// config-roots.spec.ts — SINGLE-SOURCE-Beweis (M2). (a) Default (kein Sandbox-Env)
// = reale Home-basierte Wurzeln. (b) mit RAWALLM_SANDBOX_ROOT = alle vier unter
// <temp>. (c) write-mode.allowedRoots == configRoots-Werte (keine Doppelliste).
// config-roots liest Env bei JEDEM Aufruf -> direkt setzen/loeschen, kein Reload.
// write-mode liest ENV.enabled beim Load -> fuer (c) frisch laden mit Env gesetzt.
import { test, expect } from '@playwright/test'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { configRoots, configRootList, activeSandboxRoot, discoverConfigRoots, setRootPrefsProvider, setRootExistsProvider, workspaceRoots } from '../../src/main/services/config-roots'
import { discoverRoot } from '../../src/main/services/config-root-resolution'

const WM_PATH = require.resolve('../../src/main/services/write-mode.ts')
function loadWriteMode(): typeof import('../../src/main/services/write-mode') {
  delete require.cache[WM_PATH]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/main/services/write-mode')
}

function clearEnv(): void {
  delete process.env.RAWALLM_SANDBOX_ROOT
  delete process.env.RAWALLM_WRITE_ENABLED
}

test.afterEach(() => {
  setRootPrefsProvider(() => ({}))
  setRootExistsProvider(() => true)
})

test('Root-Discovery: Prefs gewinnen vor dem vorhandenen Default und weisen die Quelle aus', () => {
  clearEnv()
  setRootPrefsProvider(() => ({
    'roots.sharedClaude': 'D:\\Config\\shared',
    'roots.workspaceParent': 'D:\\Projekte',
    'roots.projectRoot': 'D:\\Projekte\\App'
  }))
  expect(discoverConfigRoots().sharedClaude).toEqual({ value: 'D:\\Config\\shared', source: 'prefs' })
  expect(discoverConfigRoots().workspaceParent).toEqual({ value: 'D:\\Projekte', source: 'prefs' })
  expect(discoverConfigRoots().projectRoot).toEqual({ value: 'D:\\Projekte\\App', source: 'prefs' })
})

test('Root-Discovery: Sandbox gewinnt vor Prefs', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'rawallm-roots-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  setRootPrefsProvider(() => ({ 'roots.sharedClaude': 'D:\\Ignored' }))
  expect(discoverConfigRoots().sharedClaude).toEqual({ value: join(sandbox, '.shared', '.claude'), source: 'sandbox' })
  clearEnv()
})

test('Root-Discovery: fehlender Windows-Default wird direkt als none aufgeloest', () => {
  const missingWindowsRoot = 'C:\\nicht-vorhanden\\.shared\\.claude'
  expect(discoverRoot(null, missingWindowsRoot, () => false)).toEqual({ value: null, source: 'none' })
})

test('configRoots gibt fehlende Shared- und Projekt-Roots ehrlich als null weiter', () => {
  clearEnv()
  setRootExistsProvider(() => false)
  expect(configRoots().sharedClaude).toBeNull()
  expect(configRoots().projectRoot).toBeNull()
  expect(configRootList()).not.toContain(null)
})

test('(a) Default ohne RAWALLM_SANDBOX_ROOT -> reale Home-basierte Wurzeln', () => {
  clearEnv()
  const r = configRoots()
  const home = homedir()
  expect(r.claudeHome).toBe(join(home, '.claude'))
  expect(r.codexHome).toBe(join(home, '.codex'))
  expect(r.sharedClaude).toBe(join(home, 'Desktop', 'Projekte', '.shared', '.claude'))
  expect(r.projectRoot).toBe(join(home, 'Desktop', 'Projekte', 'RaWaLLMConfig'))
  // claudeHome endet auf .claude und liegt unter dem realen Home.
  expect(r.claudeHome.endsWith('.claude')).toBe(true)
  expect(r.claudeHome.startsWith(home)).toBe(true)
  expect(activeSandboxRoot()).toBeNull()
  clearEnv()
})

test('(b) mit RAWALLM_SANDBOX_ROOT -> alle vier Wurzeln unter <temp>', () => {
  clearEnv()
  const sandbox = mkdtempSync(join(tmpdir(), 'rawallm-roots-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  const r = configRoots()
  expect(r.claudeHome).toBe(join(sandbox, '.claude'))
  expect(r.codexHome).toBe(join(sandbox, '.codex'))
  expect(r.sharedClaude).toBe(join(sandbox, '.shared', '.claude'))
  expect(r.projectRoot).toBe(join(sandbox, 'project'))
  // ALLE Wurzeln zeigen unter <temp>.
  for (const p of configRootList()) {
    expect(p.startsWith(sandbox)).toBe(true)
  }
  expect(activeSandboxRoot()).toBe(sandbox)
  clearEnv()
})

test('(c) write-mode.allowedRoots == configRoots-Werte (Single Source, default)', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = '1'
  const wm = loadWriteMode()
  const ctx = wm.getWriteContext()
  expect(ctx.allowedRoots).toEqual(configRootList())
  expect(ctx.sandboxRoot).toBeNull()
  clearEnv()
})

test('(c) write-mode.allowedRoots == configRoots-Werte (Single Source, sandbox)', () => {
  clearEnv()
  const sandbox = mkdtempSync(join(tmpdir(), 'rawallm-roots-'))
  process.env.RAWALLM_WRITE_ENABLED = '1'
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  const wm = loadWriteMode()
  const ctx = wm.getWriteContext()
  expect(ctx.allowedRoots).toEqual(configRootList())
  expect(ctx.allowedRoots).toEqual([
    join(sandbox, '.claude'),
    join(sandbox, '.codex'),
    join(sandbox, '.shared', '.claude'),
    join(sandbox, 'project')
  ])
  expect(ctx.sandboxRoot).toBe(sandbox)
  clearEnv()
})

test('workspaceRoots akzeptiert POSIX-path_local und ueberspringt ssh://', () => {
  clearEnv()
  const sandbox = mkdtempSync(join(tmpdir(), 'rawallm-roots-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  const registryDir = join(sandbox, '.shared', '.claude', 'coordination', 'registry')
  mkdirSync(registryDir, { recursive: true })
  writeFileSync(join(registryDir, 'workspaces.json'), JSON.stringify({
    workspaces: {
      posix: { name: 'POSIX', path_local: '/home/test/RaWaLLMConfig' },
      remote: { name: 'Remote', path_local: 'ssh://host/repo' }
    }
  }), 'utf8')

  const roots = workspaceRoots()
  expect(roots).toContainEqual({ root: '/home/test/RaWaLLMConfig', label: 'POSIX' })
  expect(roots.some((root) => root.root.startsWith('ssh://'))).toBe(false)
  clearEnv()
})
