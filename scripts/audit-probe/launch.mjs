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
  // options.env: optionale env-Injection (z.B. RAWALLM_SANDBOX_ROOT) ueber dem
  // geerbten Prozess-env; ELECTRON_RUN_AS_NODE wird immer entfernt.
  const env = { ...process.env, ELECTRON_ENABLE_LOGGING: '1', ...(options.env ?? {}) }
  delete env.ELECTRON_RUN_AS_NODE
  const label = options.label ?? 'electron-app'
  const userDataDir = mkdtempSync(join(tmpdir(), 'rawallm-audit-'))
  let app = null
  const startedAt = Date.now()
  try {
    // Optionaler Seed-Hook (z.B. Onboarding-Stand) VOR dem ersten App-Start.
    options.prepareUserData?.(userDataDir)
    const launch = electron.launch({ args: ['.', `--user-data-dir=${userDataDir}`], cwd: process.cwd(), env })
    app = await withDeadline(launch, options.launchTimeoutMs ?? LAUNCH_TIMEOUT_MS, `${label}:launch`)
    auditUserDataDirs.set(app, userDataDir)
    const win = await withDeadline(app.firstWindow(), 10_000, `${label}:firstWindow`)
    await win.waitForLoadState('domcontentloaded')
    // Fenster sichtbar = Start -> firstWindow + domcontentloaded (ohne Festwarte).
    const windowVisibleAt = Date.now()
    if (options.readyWaitMs) await win.waitForTimeout(options.readyWaitMs)
    return { app, win, userDataDir, timing: { startedAt, windowVisibleAt } }
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

// ── HR31-Stillstand-Helfer (Windows tasklist, robust: Fehler -> null) ────────

// Lebt die PID noch? true/false; null wenn die Pruefung selbst fehlschlug.
export function checkPidAlive(pid) {
  if (!pid) return null
  try {
    const out = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    return out.includes(`"${pid}"`)
  } catch {
    return null
  }
}

// Stichprobe laufender electron.exe (HR31-Nachweis im Report). Kein Urteil —
// fremde Electron-Apps des Nutzers werden nur dokumentiert, nie beendet.
export function electronProcessSample() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq electron.exe', '/FO', 'CSV', '/NH'], { encoding: 'utf8' })
    const rows = out.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('"'))
    return { ok: true, count: rows.length, pids: rows.map((line) => line.split('","')[1]?.replace('"', '') ?? '?') }
  } catch (error) {
    return { ok: false, error: String(error).slice(0, 120) }
  }
}
