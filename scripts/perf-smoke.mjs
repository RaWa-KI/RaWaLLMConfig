// perf-smoke.mjs — perf:ui-Runner (F-WP1): caudex-Akzeptanzbudgets, drei
// Szenarien (normal / firstRun / scan), Report pro Metrik mit verdict.
// Gegatet werden normal + scan; firstRun ist informativ. Exit 1 bei FAIL.
// HR31: jede Szenario-App wird im finally geschlossen; Notfall-Close + PID-/
// Stichproben-Nachweis landen im Report (cleanup).
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { BUDGETS_VERSION, budgetEntry, overall } from './audit-probe/perf-budgets.mjs'
import { checkPidAlive, closeElectronApp, electronProcessSample } from './audit-probe/launch.mjs'
import { installedExePath, launchInstalledApp } from './audit-probe/launch-installed.mjs'
import { runFirstRunScenario, runNormalScenario, runScanScenario } from './audit-probe/perf-scenarios.mjs'
import { failPayload, PERF_SMOKE_TIMEOUT_MS, withDeadline, writeJson } from './audit-probe/timeouts.mjs'

// Target-Auswahl: Default = Dev-Build (out/); RAWALLM_PERF_TARGET=installed
// misst gegen die installierte App (exe + connectOverCDP, siehe launch-installed).
const isInstalled = process.env.RAWALLM_PERF_TARGET === 'installed'
const target = isInstalled ? 'installed' : 'dev'
const targetExe = isInstalled ? installedExePath() : null
const launchFn = isInstalled ? launchInstalledApp : undefined

const outDir = resolve('tests/audit-runtime/perf-smoke')
const reportPath = join(outDir, isInstalled ? 'perf-smoke-installed.json' : 'perf-smoke.json')
mkdirSync(outDir, { recursive: true })
const steps = []
const scenarios = {}
const ctxs = []

function recordStep(name, data = {}) {
  steps.push({ name, atMs: Date.now(), ...data })
  writeJson(reportPath, { status: 'RUNNING', target, budgetsVersion: BUDGETS_VERSION, gatedWindow: 'post-scan-quiet', generatedAt: new Date().toISOString(), scenarios, steps })
}

async function runScenario(name, runFn) {
  const ctx = {}
  ctxs.push(ctx)
  scenarios[name] = await runFn(recordStep, ctx, launchFn)
  scenarios[name].cleanup = ctx.cleanup ?? { app: ctx.cleanupApp, sandbox: ctx.cleanupSandbox }
  recordStep(`${name}:done`, { ok: true })
}

// Metrik-Report { valueMs, targetMs, hardMs, verdict } aus den Rohwerten.
function buildMetrics() {
  const normal = scenarios.normal ?? {}
  const scan = scenarios.scan ?? {}
  const metrics = {
    windowVisibleMs: budgetEntry('windowVisibleMs', normal.windowVisibleMs ?? null),
    interactiveMs: budgetEntry('interactiveMs', normal.interactiveMs ?? null),
    clickFeedbackMs: budgetEntry('clickFeedbackMs', normal.clickFeedbackMs ?? null),
    scrollLongTaskMs: budgetEntry('scrollLongTaskMs', normal.scroll?.maxDurationMs ?? null)
  }
  for (const [label, ms] of Object.entries(normal.nav ?? {})) metrics[`nav:${label}`] = budgetEntry('navMs', ms)
  for (const item of scan.feedback ?? []) metrics[`scan:${item.label}`] = budgetEntry('scanFeedbackMs', item.ms)
  return metrics
}

// HR31-Stillstand: alle Szenario-PIDs muessen nach close tot sein (+ Stichprobe).
function collectStillstand() {
  const pids = Object.values(scenarios).map((s) => s?.pid).filter(Boolean)
  return { pids: pids.map((pid) => ({ pid, alive: checkPidAlive(pid) })), electronSample: electronProcessSample() }
}

async function runPerf() {
  recordStep('start')
  await runScenario('normal', runNormalScenario)
  await runScenario('firstRun', runFirstRunScenario)
  await runScenario('scan', runScanScenario)
  const metrics = buildMetrics()
  const verdictAll = overall(metrics)
  const status = verdictAll === 'fail' ? 'FAIL' : verdictAll === 'warn' ? 'WARN' : 'PASS'
  const report = {
    status,
    target,
    exe: targetExe,
    budgetsVersion: BUDGETS_VERSION,
    gatedWindow: 'post-scan-quiet',
    generatedAt: new Date().toISOString(),
    metrics,
    scenarios,
    stillstand: collectStillstand(),
    steps
  }
  writeJson(reportPath, report)
  return report
}

// Kurzfassung der Metriken fuer die Konsole (Rohwerte bleiben im Report).
function consoleSummary(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, entry]) => [key, `${entry.valueMs ?? '?'}ms:${entry.verdict}`]))
}

try {
  const report = await withDeadline(runPerf(), PERF_SMOKE_TIMEOUT_MS, 'perf-smoke')
  console.log(JSON.stringify({ status: report.status, target, budgetsVersion: BUDGETS_VERSION, report: reportPath, metrics: consoleSummary(report.metrics) }, null, 2))
  if (report.status === 'FAIL') process.exit(1)
} catch (error) {
  // Notfall-Close (z.B. Deadline mitten im Szenario) — HR31 auf allen Pfaden.
  for (const ctx of ctxs) {
    if (ctx.app) await closeElectronApp(ctx.app).catch(() => {})
  }
  const failed = { ...failPayload('perf-smoke', error), target, budgetsVersion: BUDGETS_VERSION, scenarios, stillstand: collectStillstand(), steps }
  writeJson(reportPath, failed)
  console.error(JSON.stringify({ status: 'FAIL', report: reportPath, error: failed.error }, null, 2))
  process.exit(1)
}
