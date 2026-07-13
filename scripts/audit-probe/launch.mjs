import { _electron as electron } from '@playwright/test'
import { mkdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { LAUNCH_TIMEOUT_MS, withDeadline } from './timeouts.mjs'

const auditUserDataDirs = new WeakMap()

export function prepareAuditRuntime() {
  const outDir = resolve('tests/audit-runtime')
  const shotsDir = join(outDir, 'shots')
  const dumpPath = join(outDir, 'dump.json')
  mkdirSync(outDir, { recursive: true })
  mkdirSync(shotsDir, { recursive: true })
  return { outDir, shotsDir, dumpPath }
}

export function getHeadCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch (error) {
    return `unknown:${String(error).slice(0, 80)}`
  }
}

export function builtMainExists() {
  return existsSync(resolve('out/main/index.js'))
}

function removeAuditUserData(app) {
  const userDataDir = auditUserDataDirs.get(app)
  if (!userDataDir) return { attempted: false }
  try {
    rmSync(userDataDir, { recursive: true, force: true })
    auditUserDataDirs.delete(app)
    return { attempted: true, ok: true }
  } catch (error) {
    return { attempted: true, ok: false, error: String(error).slice(0, 160) }
  }
}

async function waitForProcessExit(process) {
  if (!process || process.exitCode !== null) return true
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), 2_000)
    process.once('exit', () => {
      clearTimeout(timer)
      resolveExit(true)
    })
  })
}

export async function launchElectronApp(options = {}) {
  if (!builtMainExists()) throw new Error('built app missing: run pnpm build before UI/perf smoke')
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const label = options.label ?? 'electron-app'
  const userDataDir = mkdtempSync(join(tmpdir(), 'rawallm-audit-'))
  let app = null
  try {
    const launch = electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: process.cwd(), env })
    app = await withDeadline(launch, options.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS, `${label}:launch`)
    auditUserDataDirs.set(app, userDataDir)
    const win = await withDeadline(app.firstWindow(), 10_000, `${label}:firstWindow`)
    await win.waitForLoadState('domcontentloaded')
    if (options.readyWaitMs) await win.waitForTimeout(options.readyWaitMs)
    return { app, win }
  } catch (error) {
    if (app) await closeElectronApp(app)
    else rmSync(userDataDir, { recursive: true, force: true })
    throw error
  }
}

export async function closeElectronApp(app) {
  if (!app) return { ok: true, method: 'none' }
  try {
    await app.close()
    return { ok: true, method: 'close', cleanup: removeAuditUserData(app) }
  } catch (closeError) {
    const closeMessage = String(closeError).slice(0, 160)
    try {
      const process = app.process()
      process?.kill()
      const exited = await waitForProcessExit(process)
      return { ok: false, method: exited ? 'kill' : 'kill-timeout', closeError: closeMessage, cleanup: exited ? removeAuditUserData(app) : { attempted: false } }
    } catch (killError) {
      return { ok: false, method: 'failed', closeError: closeMessage, killError: String(killError).slice(0, 160) }
    }
  }
}

export async function safeEval(win, fn, label, ...args) {
  try {
    return await win.evaluate(fn, ...args)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[audit-probe] evaluate FAIL (${label}):`, message.slice(0, 120))
    return { _evalError: message.slice(0, 200) }
  }
}
