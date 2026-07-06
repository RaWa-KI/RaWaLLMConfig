import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeElectronApp, launchElectronApp } from './audit-probe/launch.mjs'
import { appTextLength, navByText, scrollMetric, visibleCount } from './audit-probe/perf-metrics.mjs'
import { failPayload, PERF_SMOKE_TIMEOUT_MS, withDeadline, writeJson } from './audit-probe/timeouts.mjs'

const outDir = resolve('tests/audit-runtime/perf-smoke')
const reportPath = join(outDir, 'perf-smoke.json')
mkdirSync(outDir, { recursive: true })
let app = null
const steps = []

function recordStep(name, data = {}) {
  steps.push({ name, atMs: Date.now(), ...data })
  writeJson(reportPath, { status: 'RUNNING', generatedAt: new Date().toISOString(), steps })
}

async function runPerf() {
  const started = Date.now()
  recordStep('start')
  const launched = await launchElectronApp({ label: 'perf-smoke', readyWaitMs: 1200 })
  app = launched.app
  const win = launched.win
  const launchMs = Date.now() - started
  recordStep('launch', { launchMs })
  await win.locator('.sec-btn').first().waitFor({ state: 'visible', timeout: 10_000 })
  const interactiveMs = Date.now() - started
  recordStep('interactive', { interactiveMs })
  const configTextLength = await appTextLength(win)
  recordStep('config-text', { configTextLength })
  const systemNavMs = await navByText(win, '.sec-btn', 'System')
  recordStep('system', { systemNavMs })
  const updatesNavMs = await navByText(win, '.sec-btn', 'Updates')
  recordStep('updates', { updatesNavMs })
  const settingsNavMs = await navByText(win, '.sec-btn', 'Einstellungen')
  recordStep('settings', { settingsNavMs })
  const appUpdateMs = await navByText(win, '.mode-tab', 'App-Update', 500)
  recordStep('app-update', { appUpdateMs })
  const updateReactionMs = await measureUpdateReaction(win)
  recordStep('update-reaction', { updateReactionMs })
  const scroll = await scrollMetric(win)
  recordStep('scroll', { scroll })
  const visibleRows = await visibleCount(win, '.rows .row')
  const report = { status: 'PASS', generatedAt: new Date().toISOString(), launchMs, interactiveMs, configTextLength, systemNavMs, updatesNavMs, settingsNavMs, appUpdateMs, updateReactionMs, scroll, visibleRows, steps }
  enforceThresholds(report)
  writeJson(reportPath, report)
  return report
}

async function measureUpdateReaction(win) {
  const started = Date.now()
  const clicked = await win.evaluate(() => {
    const buttons = [...document.querySelectorAll('.ump-btn')]
    const found = buttons.find((el) => /Prüfen|Erneut prüfen/i.test(el.textContent ?? ''))
    if (!(found instanceof HTMLButtonElement)) return false
    found.click()
    return true
  }).catch(() => false)
  if (!clicked) return null
  await win.waitForTimeout(250)
  return Date.now() - started
}

function enforceThresholds(report) {
  const hard = { launchMs: 20_000, interactiveMs: 25_000, systemNavMs: 6_000, updatesNavMs: 6_000, settingsNavMs: 6_000, appUpdateMs: 6_000 }
  for (const [key, max] of Object.entries(hard)) if ((report[key] ?? 0) > max) throw new Error(`${key} too slow: ${report[key]}ms > ${max}ms`)
  if (report.configTextLength < 20) throw new Error('app text too short after launch')
}

try {
  const report = await withDeadline(runPerf(), PERF_SMOKE_TIMEOUT_MS, 'perf-smoke')
  await closeElectronApp(app)
  console.log(JSON.stringify({ status: 'PASS', report: reportPath, launchMs: report.launchMs, interactiveMs: report.interactiveMs }, null, 2))
} catch (error) {
  await closeElectronApp(app)
  const failed = { ...failPayload('perf-smoke', error), steps }
  writeJson(reportPath, failed)
  console.error(JSON.stringify({ status: 'FAIL', report: reportPath, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exit(1)
}
