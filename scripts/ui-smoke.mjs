import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { closeElectronApp, launchElectronApp } from './audit-probe/launch.mjs'
import { failPayload, STEP_TIMEOUT_MS, UI_SMOKE_TIMEOUT_MS, withDeadline, writeJson } from './audit-probe/timeouts.mjs'

const outDir = resolve('tests/audit-runtime/ui-smoke')
const reportPath = join(outDir, 'ui-smoke.json')
const screenshotPath = join(outDir, 'ui-smoke.png')
mkdirSync(outDir, { recursive: true })
let app = null
let progress = null

async function runSmoke() {
  const result = { status: 'PASS', generatedAt: new Date().toISOString(), steps: [] }
  progress = result
  const launched = await launchElectronApp({ label: 'ui-smoke', readyWaitMs: 1800 })
  app = launched.app
  const win = launched.win
  await assertNotBlank(win, result)
  if (await onboardingVisible(win)) {
    await assertReady(win, result, 'Onboarding', '.ob-card')
    await assertReady(win, result, 'Model setup', '.ob-hits, .ob-state button')
    await finishSmoke(win, result)
    return
  }
  await assertReady(win, result, 'App shell', '.sec-btn, .settings-tabs, .nav-item, .rows, .empty')
  await clickSection(win, result, 'System', 'text=System-Umgebung')
  await clickSection(win, result, 'Prüfen', '.upd-full, .daemon-card, .empty-state')
  await clickSection(win, result, 'Einstellungen', '.settings-tabs')
  await clickMode(win, result, 'Updates', '.ump-wrap')
  await finishSmoke(win, result)
}

async function finishSmoke(win, result) {
  result.title = await win.title().catch(() => '')
  result.url = typeof win.url === 'function' ? win.url() : ''
  await win.screenshot({ path: screenshotPath })
  result.screenshot = screenshotPath
  writeJson(reportPath, result)
}

async function onboardingVisible(win) {
  return (await win.locator('.ob-card').count().catch(() => 0)) > 0
}

async function assertNotBlank(win, result) {
  await win.locator('body').waitFor({ state: 'visible', timeout: 10_000 })
  const textLength = await win.evaluate(() => document.body?.innerText?.trim().length ?? 0)
  const overlay = await win.locator('text=/vite|webpack|error overlay/i').count().catch(() => 0)
  result.steps.push({ id: 'not-blank', textLength, overlay })
  if (textLength < 20) throw new Error(`blank app: body text length ${textLength}`)
  if (overlay > 0) throw new Error('framework/error overlay visible')
}

async function clickSection(win, result, label, readySelector) {
  const started = Date.now()
  await clickControl(win, '.sec-btn', label)
  await waitReady(win, readySelector)
  result.steps.push({ id: `section:${label}`, ms: Date.now() - started })
  writeJson(reportPath, result)
}

async function clickMode(win, result, label, readySelector) {
  const started = Date.now()
  await clickControl(win, '.mode-tab', label)
  await waitReady(win, readySelector)
  result.steps.push({ id: `mode:${label}`, ms: Date.now() - started })
  writeJson(reportPath, result)
}

async function clickControl(win, selector, label) {
  await withDeadline(
    win.evaluate(({ selector, label }) => {
      const controls = [...document.querySelectorAll(selector)]
      const found = controls.find((el) => {
        const visible = el.textContent ?? ''
        const title = el.getAttribute('title') ?? ''
        const aria = el.getAttribute('aria-label') ?? ''
        return [visible, title, aria].some((text) => text.includes(label))
      })
      if (!(found instanceof HTMLElement)) throw new Error(`control not found: ${label}`)
      found.click()
    }, { selector, label }),
    STEP_TIMEOUT_MS,
    `click:${label}`
  )
}

async function assertReady(win, result, label, readySelector) {
  const started = Date.now()
  await waitReady(win, readySelector)
  result.steps.push({ id: `section:${label}:initial`, ms: Date.now() - started })
  writeJson(reportPath, result)
}

async function waitReady(win, readySelector) {
  const wait = win.locator(readySelector).first().waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  await withDeadline(wait, STEP_TIMEOUT_MS + 500, `ready:${readySelector}`)
}

try {
  await withDeadline(runSmoke(), UI_SMOKE_TIMEOUT_MS, 'ui-smoke')
  await closeElectronApp(app)
  console.log(JSON.stringify({ status: 'PASS', report: reportPath, screenshot: screenshotPath }, null, 2))
} catch (error) {
  await closeElectronApp(app)
  writeJson(reportPath, failPayload('ui-smoke', error, { screenshot: screenshotPath, steps: progress?.steps ?? [] }))
  console.error(JSON.stringify({ status: 'FAIL', report: reportPath, error: error instanceof Error ? error.message : String(error) }, null, 2))
  process.exit(1)
}
