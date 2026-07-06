// write-mode.spec.ts — Schreib-/Sandbox-GATE (P0-1). DEFAULT (kein Env) = AN
// (Owner-Entscheid): Bearbeiten ist eingeschaltet. NUR RAWALLM_WRITE_ENABLED=0
// oder =false schaltet aus (Opt-out); leer/1/true = AN. Der In-App-Schalter
// (Runtime-Override) ueberschreibt den Env-Wert. Schutz bleibt: Mutationen
// laufen trotz Default-AN ueber backup-first/secret-guard/Scope.
// write-mode liest Env EINMAL beim Modul-Load -> wir laden das Modul je Szenario
// frisch (require-Cache invalidieren), Env vorher setzen/zuruecksetzen.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyWrite } from '../../src/main/services/apply'
import { makeSandbox } from './fixtures'

const MODULE_PATH = require.resolve('../../src/main/services/write-mode.ts')

// KANONISCHE write-mode-Instanz festhalten (die apply.ts/secret-guard.ts bereits
// gebunden haben — apply wird oben statisch importiert, laedt write-mode mit).
// loadWriteMode() unten invalidiert den require-Cache, um Env neu zu lesen; ohne
// Restore wuerde diese frische Instanz im Cache zurueckbleiben und in PARALLELE
// Specs desselben Worker-Prozesses leaken (Flaky-Root: zwei write-mode-Singletons
// -> setWriteEnabledRuntime trifft die andere Instanz als isWriteEnabled).
const ORIGINAL_MODULE = require.cache[MODULE_PATH]

// Nach jedem Test die kanonische Instanz wieder in den Cache legen, damit andere
// Specs (secret-guard) den Singleton sehen, an den der Produktionscode gebunden ist.
test.afterEach(() => {
  if (ORIGINAL_MODULE) require.cache[MODULE_PATH] = ORIGINAL_MODULE
})

// write-mode frisch laden NACH gesetztem Env (Env wird beim Load gelesen).
function loadWriteMode(): typeof import('../../src/main/services/write-mode') {
  delete require.cache[MODULE_PATH]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/main/services/write-mode')
}

// Env-Keys, die write-mode/config-roots lesen — vor/nach jedem Szenario sauber halten.
const KEYS = ['RAWALLM_WRITE_ENABLED', 'RAWALLM_SANDBOX_ROOT', 'RAWALLM_ARCHIVE_ROOT', 'RAWALLM_AUDIT_PATH']
function clearEnv(): void {
  for (const k of KEYS) delete process.env[k]
}

test('DEFAULT (kein RAWALLM_WRITE_ENABLED) -> Bearbeiten eingeschaltet', () => {
  clearEnv()
  const wm = loadWriteMode()
  expect(wm.isWriteEnabled()).toBe(true)
  clearEnv()
})

test('Leeres RAWALLM_WRITE_ENABLED -> eingeschaltet (wie nicht gesetzt)', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = ''
  const wm = loadWriteMode()
  expect(wm.isWriteEnabled()).toBe(true)
  clearEnv()
})

test('RAWALLM_WRITE_ENABLED=1 / =true -> eingeschaltet', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = '1'
  expect(loadWriteMode().isWriteEnabled()).toBe(true)
  process.env.RAWALLM_WRITE_ENABLED = 'true'
  expect(loadWriteMode().isWriteEnabled()).toBe(true)
  clearEnv()
})

test('Opt-out RAWALLM_WRITE_ENABLED=0 -> ausgeschaltet', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = '0'
  const wm = loadWriteMode()
  expect(wm.isWriteEnabled()).toBe(false)
  expect(wm.getWriteStatus().enabled).toBe(false)
  expect(wm.getWriteStatus().reason).toBe(wm.WRITE_DISABLED_REASON)
  clearEnv()
})

test('Opt-out RAWALLM_WRITE_ENABLED=false (case-insensitiv) -> ausgeschaltet', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = 'FALSE'
  expect(loadWriteMode().isWriteEnabled()).toBe(false)
  clearEnv()
})

test('Opt-out blockt Mutations-Dispatch, reale Datei unveraendert', () => {
  clearEnv()
  process.env.RAWALLM_WRITE_ENABLED = '0'
  const wm = loadWriteMode()
  // Simulierter Handler: Gate ZUERST. AUS -> kein applyWrite, reale Datei bleibt.
  const sb = makeSandbox()
  const target = join(sb.configDir, 'real.md')
  writeFileSync(target, 'UNVERAENDERT', 'utf8')
  let res: { data: unknown; error: string | null }
  if (!wm.isWriteEnabled()) {
    res = { data: null, error: wm.WRITE_DISABLED_REASON }
  } else {
    res = applyWrite({ action: 'edit', path: target, content: 'SOLL-NICHT' }, wm.getWriteContext())
  }
  expect(res.error).toBe(wm.WRITE_DISABLED_REASON)
  expect(res.error).not.toContain('M2')
  expect(readFileSync(target, 'utf8')).toBe('UNVERAENDERT')
  clearEnv()
})

test('Runtime-Override: In-App-Schalter ueberschreibt Env (AN->AUS und AUS->AN)', () => {
  clearEnv()
  // Default-AN; Override AUS -> deaktiviert.
  const wm = loadWriteMode()
  expect(wm.isWriteEnabled()).toBe(true)
  wm.setWriteEnabledRuntime(false)
  expect(wm.isWriteEnabled()).toBe(false)
  expect(wm.getWriteStatus().reason).toBe(wm.WRITE_DISABLED_REASON)
  // Override AN -> wieder aktiviert.
  wm.setWriteEnabledRuntime(true)
  expect(wm.isWriteEnabled()).toBe(true)
  // null -> Env-Fallback (hier Default-AN).
  wm.setWriteEnabledRuntime(null)
  expect(wm.isWriteEnabled()).toBe(true)
  // Override AN trotz Opt-out-Env=0 (Override hat Vorrang).
  process.env.RAWALLM_WRITE_ENABLED = '0'
  const wm2 = loadWriteMode()
  expect(wm2.isWriteEnabled()).toBe(false)
  wm2.setWriteEnabledRuntime(true)
  expect(wm2.isWriteEnabled()).toBe(true)
  wm2.setWriteEnabledRuntime(null)
  clearEnv()
})

test('Enabled+SANDBOX_ROOT: Write landet im Sandbox, write-context confined', () => {
  clearEnv()
  const sb = makeSandbox()
  const sandboxRoot = join(sb.root, 'sbx')
  mkdirSync(sandboxRoot, { recursive: true })
  process.env.RAWALLM_WRITE_ENABLED = '1'
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
  const wm = loadWriteMode()
  expect(wm.isWriteEnabled()).toBe(true)
  const ctx = wm.getWriteContext()
  // allowedRoots == die vier Config-Wurzeln unter dem Sandbox-Root (Single Source).
  expect(ctx.allowedRoots).toEqual([
    join(sandboxRoot, '.claude'),
    join(sandboxRoot, '.codex'),
    join(sandboxRoot, '.shared', '.claude'),
    join(sandboxRoot, 'project')
  ])
  // sandboxRoot wird durchgereicht; Archiv + Audit liegen darunter.
  expect(ctx.sandboxRoot).toBe(sandboxRoot)
  expect(ctx.archiveRoot.startsWith(sandboxRoot)).toBe(true)
  expect(ctx.auditPath.startsWith(sandboxRoot)).toBe(true)
  // add UNTER einer Config-Wurzel (z.B. <sandbox>/.claude) -> erlaubt.
  mkdirSync(ctx.archiveRoot, { recursive: true })
  const inside = join(sandboxRoot, '.claude', 'rules', 'neu.md')
  const ok = applyWrite({ action: 'add', path: inside, content: 'X' }, ctx)
  expect(ok.error).toBeNull()
  expect(readFileSync(inside, 'utf8')).toBe('X')
  // add AUSSERHALB der Config-Wurzeln (direkt unter Sandbox-Root) -> out-of-scope.
  const outside = join(sandboxRoot, 'aussen.md')
  const blocked = applyWrite({ action: 'add', path: outside, content: 'Y' }, ctx)
  expect(blocked.error).toBe('out-of-scope')
  expect(existsSync(outside)).toBe(false)
  clearEnv()
})
