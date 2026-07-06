import { _electron as electron } from '@playwright/test'
import { mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { LAUNCH_TIMEOUT_MS, withDeadline } from './timeouts.mjs'

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

export async function launchElectronApp(options = {}) {
  if (!builtMainExists()) throw new Error('built app missing: run pnpm build before UI/perf smoke')
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  const label = options.label ?? 'electron-app'
  const launch = electron.launch({ args: ['.'], cwd: process.cwd(), env })
  const app = await withDeadline(launch, options.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS, `${label}:launch`)
  const win = await withDeadline(app.firstWindow(), 10_000, `${label}:firstWindow`)
  await win.waitForLoadState('domcontentloaded')
  if (options.readyWaitMs) await win.waitForTimeout(options.readyWaitMs)
  return { app, win }
}

export async function closeElectronApp(app) {
  if (!app) return { ok: true, method: 'none' }
  try {
    await app.close()
    return { ok: true, method: 'close' }
  } catch (closeError) {
    const closeMessage = String(closeError).slice(0, 160)
    try {
      await app.process()?.kill()
      return { ok: false, method: 'kill', closeError: closeMessage }
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
