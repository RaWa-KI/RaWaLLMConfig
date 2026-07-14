import { _electron as electron } from '@playwright/test'
import { createHash } from 'node:crypto'
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { closeElectronApp } from './audit-probe/launch.mjs'
import {
  failPayload, STEP_TIMEOUT_MS, UI_SMOKE_TIMEOUT_MS, withDeadline, writeJson
} from './audit-probe/timeouts.mjs'

const outDir = resolve('tests/audit-runtime/ui-smoke-flows')
const reportPath = join(outDir, 'ui-smoke-flows.json')
const screenshotPath = join(outDir, 'ui-smoke-flows.png')
const state = { status: 'PASS', generatedAt: new Date().toISOString(), steps: [] }
let app = null

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function record(id, evidence) {
  state.steps.push({ id, ...evidence })
  writeJson(reportPath, state)
}

function prepareRuntime() {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-s9-flows-'))
  seedConfigRoots(root)
  const userData = join(root, 'user-data')
  const sourceRoot = join(root, 'source-ui')
  const projectRoot = join(root, 'project-ui')
  const updateDir = join(root, 'updates')
  const reportFile = join(root, 'diagnostic-report.json')
  for (const dir of [userData, sourceRoot, projectRoot, updateDir]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(sourceRoot, 'AGENTS.md'), '# S9 UI source\n', 'utf8')
  writeFileSync(join(userData, 'sources.json'), JSON.stringify({ version: 2, sources: [], onboardingVersion: 2 }), 'utf8')
  seedArchive(root)
  const update = seedUpdate(updateDir)
  return { root, userData, sourceRoot, projectRoot, updateDir, reportFile, update }
}

function seedConfigRoots(root) {
  const fixtures = [
    [join(root, '.claude', 'CLAUDE.md'), '# Claude sandbox\n'],
    [join(root, '.codex', 'AGENTS.md'), '# Codex sandbox\n'],
    [join(root, '.shared', '.claude', 'AGENTS.md'), '# Shared sandbox\n'],
    [join(root, 'project', 'AGENTS.md'), '# Project sandbox\n']
  ]
  for (const [path, content] of fixtures) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
  }
}

function seedArchive(root) {
  const dayDir = join(root, '_archive', '2026-07-10-phase2-write')
  mkdirSync(dayDir, { recursive: true })
  writeFileSync(join(dayDir, 's9-evidence.md.120000-000.bak'), 'S9 archive evidence\n', 'utf8')
}

function seedUpdate(updateDir) {
  const linux = process.platform === 'linux'
  const name = linux ? 'RaWaLLMConfig-9.9.9.AppImage' : 'RaWaLLMConfig-9.9.9.exe'
  const content = linux
    ? Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x53, 0x39])
    : Buffer.from([0x4d, 0x5a, 0x53, 0x39])
  writeFileSync(join(updateDir, name), content)
  const sha256 = createHash('sha256').update(content).digest('hex')
  const manifest = {
    tag_name: 'v9.9.9', name: 'S9 local fixture', body: 'Sandbox update fixture',
    published_at: '2026-07-10T00:00:00.000Z', prerelease: false,
    assets: [{
      name, browser_download_url: `file://${name}`, size: content.length, sha256,
      content_type: linux ? 'application/x-appimage' : 'application/x-msdownload'
    }]
  }
  writeFileSync(join(updateDir, 'latest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  return { name, size: content.length, sha256 }
}

async function launch(runtime) {
  const env = {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    RAWALLM_SANDBOX_ROOT: runtime.root,
    RAWALLM_ARCHIVE_ROOT: join(runtime.root, '_archive'),
    RAWALLM_AUDIT_PATH: join(runtime.root, 'audit-log.jsonl'),
    RAWALLM_UPDATE_DIR: runtime.updateDir,
    RAWALLM_WRITE_ENABLED: '1'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const launched = await withDeadline(
    electron.launch({ args: ['.', `--user-data-dir=${runtime.userData}`], cwd: process.cwd(), env }),
    25_000,
    'ui-smoke-flows:launch'
  )
  const win = await withDeadline(launched.firstWindow(), 10_000, 'ui-smoke-flows:firstWindow')
  await win.waitForLoadState('domcontentloaded')
  await win.locator('body').waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  return { app: launched, win }
}

async function patchDialogs(runtime) {
  return app.evaluate(({ dialog }, paths) => {
    let openIndex = 0
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [paths.open[Math.min(openIndex++, paths.open.length - 1)]]
    })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.save })
    return { ok: true, method: 'main-dialog-patch' }
  }, { open: [runtime.sourceRoot, runtime.projectRoot], save: runtime.reportFile })
}

async function openSettings(win, tab = 'tweaks') {
  const settingsButton = win.getByRole('button', { name: /(?:Einstellungen|Settings) öffnen/i })
  await settingsButton.waitFor({ state: 'visible', timeout: 60_000 })
  await settingsButton.click()
  await win.locator('.settings-tabs').waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  await win.locator(`#settings-tab-${tab}`).click()
}

async function addSource(win, runtime, dialogs) {
  await openSettings(win, 'sources')
  assert(dialogs.ok, 'main dialog patch failed')
  await win.getByRole('button', { name: /Quelle hinzufügen/i }).click()
  const modal = win.locator('[role="dialog"]')
  await modal.getByRole('button', { name: /Ordner wählen/i }).click()
  await modal.locator('input').fill('S9 UI Source')
  await modal.getByRole('button', { name: /^Hinzufügen$/i }).click()
  await win.getByText('S9 UI Source', { exact: true }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  const listed = await win.evaluate(() => window.electronAPI.listSources())
  assert(listed.data?.some((source) => source.label === 'S9 UI Source'), 'source missing from bridge')
  const persisted = JSON.parse(readFileSync(join(runtime.userData, 'sources.json'), 'utf8'))
  assert(persisted.onboardingVersion === 2, 'onboarding version changed')
  assert(persisted.sources.some((source) => source.root === runtime.sourceRoot), 'source missing from store')
  record('source-add', { method: dialogs.method, domVisible: true, bridgeCount: listed.data.length, persisted: true })
}

async function setProjectRoot(win, runtime, dialogs) {
  await openSettings(win, 'tweaks')
  const row = win.locator('.backup-row').filter({ hasText: 'RaWaLLMConfig-Ordner' })
  assert(dialogs.ok, 'main dialog patch failed')
  await row.getByRole('button', { name: /Ordner wählen/i }).click()
  await waitFor(async () => {
    const result = await win.evaluate(() => window.electronAPI.prefsGet({ key: 'roots.projectRoot' }))
    return result.data?.prefs?.['roots.projectRoot'] === runtime.projectRoot
  }, 'projectRoot persistence')
  await row.getByText(runtime.projectRoot, { exact: true }).waitFor({ state: 'visible' })
  const prefs = JSON.parse(readFileSync(join(runtime.root, 'prefs.json'), 'utf8'))
  assert(prefs['roots.projectRoot'] === runtime.projectRoot, 'projectRoot missing from prefs store')
  record('project-root', { method: dialogs.method, bridge: true, persisted: true, domVisible: true })
}

async function checkConfigAndUpdate(win, runtime) {
  const evidence = await win.evaluate(async () => {
    const config = await window.electronAPI.readConfig()
    const update = await window.electronAPI.updatesCheck()
    const paths = Object.values(config.data?.data ?? {}).flatMap((family) =>
      (family.categories ?? []).flatMap((cat) => (cat.entries ?? []).map((entry) => entry.path).filter(Boolean)))
    return {
      configError: config.error, familyCount: Object.keys(config.data?.data ?? {}).length,
      paths, updateError: update.error, update: update.data
    }
  })
  assert(!evidence.configError && evidence.familyCount > 0, `config read failed: ${evidence.configError}`)
  const normalized = evidence.paths.map((path) => resolve(path))
  const forbidden = [
    resolve(homedir(), '.claude'), resolve(homedir(), '.codex'),
    resolve(dirname(process.cwd()), '.shared', '.claude')
  ]
  const isWithin = (path, root) => path === root || path.startsWith(root + sep)
  assert(normalized.some((path) => isWithin(path, resolve(runtime.root))), 'sandbox seed missing from config read')
  assert(!normalized.some((path) => forbidden.some((root) => isWithin(path, root))), 'config read touched a real root')
  assert(!evidence.updateError && evidence.update?.hasUpdate, `update check failed: ${evidence.updateError}`)
  assert(evidence.update.info?.sha256 === runtime.update.sha256, 'update hash mismatch')
  await openSettings(win, 'updates')
  await win.getByText('Update verfügbar', { exact: true }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  await win.getByText('9.9.9', { exact: true }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  record('config-update', {
    sandboxOnly: true, familyCount: evidence.familyCount, updateAvailable: true,
    asset: runtime.update.name, size: runtime.update.size, sha256Verified: true
  })
}

async function checkArchiveAndDiagnostics(win, runtime) {
  await win.getByRole('button', { name: /^Wiederherstellen$/i }).click()
  await win.getByText('Archiv & Wiederherstellen', { exact: true }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  await win.getByText('s9-evidence.md', { exact: true }).waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
  const archives = await win.evaluate(() => window.electronAPI.archiveList())
  assert(archives.data?.entries.some((entry) => entry.originalName === 's9-evidence.md'), 'archive bridge evidence missing')
  const sensitiveRoot = process.platform === 'linux'
    ? join(sep, 'home', 'smoke-user')
    : join(homedir(), 'PrivateSmoke')
  const sensitivePath = join(sensitiveRoot, 'private.txt')
  const sensitiveSource = pathToFileURL(join(sensitiveRoot, 'app.tsx')).href
  const sensitiveStack = `at Widget (${join(sensitiveRoot, 'Widget.tsx')}:1)`
  const saved = await win.evaluate((error) => window.electronAPI.saveErrorReport({ error }), {
    message: `Smoke ${sensitivePath}`, source: sensitiveSource, componentStack: sensitiveStack
  })
  assert(!saved.error && saved.data?.canceled === false, `diagnostic save failed: ${saved.error}`)
  assert(existsSync(runtime.reportFile), 'diagnostic report missing')
  const raw = readFileSync(runtime.reportFile, 'utf8')
  assert(!raw.includes(sensitiveRoot) && !raw.includes(sensitiveSource), 'diagnostic path was not sanitized')
  record('archive-diagnostics', { archiveDom: true, archiveBridge: true, reportSaved: true, sanitized: true })
}

async function waitFor(check, label) {
  await withDeadline((async () => {
    while (!(await check())) await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  })(), STEP_TIMEOUT_MS, label)
}

async function run() {
  mkdirSync(outDir, { recursive: true })
  const runtime = prepareRuntime()
  const launched = await launch(runtime)
  app = launched.app
  const win = launched.win
  const dialogs = await patchDialogs(runtime)
  record('runtime', { sandbox: true, onboardingVersion: 2, dialogMethod: dialogs.method })
  await addSource(win, runtime, dialogs)
  await setProjectRoot(win, runtime, dialogs)
  await checkConfigAndUpdate(win, runtime)
  await checkArchiveAndDiagnostics(win, runtime)
  await win.screenshot({ path: screenshotPath, fullPage: true })
  state.screenshot = 'tests/audit-runtime/ui-smoke-flows/ui-smoke-flows.png'
  writeJson(reportPath, state)
}

try {
  await withDeadline(run(), UI_SMOKE_TIMEOUT_MS, 'ui-smoke-flows')
  const closed = await closeElectronApp(app)
  record('close', { method: closed.method, ok: closed.ok })
  console.log(JSON.stringify({ status: 'PASS', report: reportPath, screenshot: screenshotPath }, null, 2))
} catch (error) {
  const closed = await closeElectronApp(app)
  writeJson(reportPath, failPayload('ui-smoke-flows', error, { steps: state.steps, close: closed }))
  console.error(JSON.stringify({
    status: 'FAIL', report: reportPath,
    error: error instanceof Error ? error.message : String(error)
  }, null, 2))
  process.exit(1)
}
