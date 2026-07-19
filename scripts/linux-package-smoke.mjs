import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir, mkdtemp, open, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { chromium } from '@playwright/test'
import {
  pollUntil, runTextCommand, terminateProcess, waitForExit, waitForSpawn
} from './audit-probe/process-control.mjs'

const reportDir = resolve('tests/audit-runtime/linux-package-smoke')
const reportPath = join(reportDir, 'linux-package-smoke.json')
const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf8'))
const expected = {
  appImage: resolve(`dist-release/RaWaLLMConfig-${pkg.version}.AppImage`),
  deb: resolve(`dist-release/RaWaLLMConfig-${pkg.version}.deb`),
  rpm: resolve(`dist-release/RaWaLLMConfig-${pkg.version}.rpm`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function command(commandName, args, options = {}) {
  return runTextCommand(commandName, args, options)
}

async function assertElfAndMode(path, label) {
  const info = await stat(path)
  const handle = await open(path, 'r')
  const magic = Buffer.alloc(4)
  try {
    await handle.read(magic, 0, magic.length, 0)
  } finally {
    await handle.close()
  }
  assert(magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])), `${label} is not ELF`)
  assert((info.mode & 0o111) !== 0, `${label} is not executable`)
  return { path, size: info.size, mode: `0${(info.mode & 0o777).toString(8)}`, elf: true }
}

async function collectFiles(root) {
  const result = []
  const queue = [root]
  while (queue.length > 0) {
    const current = queue.shift()
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) queue.push(path)
      else if (entry.isFile()) result.push(path)
    }
  }
  return result
}

async function assertPayload(root, label) {
  const files = await collectFiles(root)
  const appAsar = files.find((path) => path.endsWith(join('resources', 'app.asar')))
  const binary = files.find((path) => basename(path) === 'rawallmconfig')
  assert(appAsar, `${label} payload lacks resources/app.asar`)
  assert(binary, `${label} payload lacks rawallmconfig executable`)
  const executable = await assertElfAndMode(binary, `${label} executable`)
  return { fileCount: files.length, appAsar, executable }
}

async function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolvePort(port))
    })
  })
}

async function waitForCdp(port) {
  await pollUntil(async (signal) => {
    try {
      return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal })).ok
    } catch (error) {
      if (error?.name !== 'AbortError') return false
      throw error
    }
  }, 30_000, 'package-appimage:cdp')
}

async function firstCdpPage(browser) {
  let page
  await pollUntil(() => {
    page = browser.contexts().flatMap((context) => context.pages())[0]
    return Boolean(page)
  }, 15_000, 'package-appimage:firstPage')
  return page
}

async function extractAppImage(path, tempRoot) {
  const target = join(tempRoot, 'appimage')
  await mkdir(target)
  await command(path, ['--appimage-extract'], { cwd: target })
  const root = join(target, 'squashfs-root')
  const payload = await assertPayload(root, 'AppImage')
  return { executable: payload.executable.path, payload }
}

async function prepareAppImageRuntime(tempRoot) {
  const sandboxRoot = join(tempRoot, 'sandbox')
  const userData = join(tempRoot, 'user-data')
  await mkdir(sandboxRoot, { recursive: true })
  await mkdir(userData, { recursive: true })
  const env = {
    ...process.env,
    APPIMAGE_EXTRACT_AND_RUN: '1',
    ELECTRON_ENABLE_LOGGING: '1',
    RAWALLM_SANDBOX_ROOT: sandboxRoot,
    RAWALLM_ARCHIVE_ROOT: join(sandboxRoot, 'archive'),
    RAWALLM_AUDIT_PATH: join(sandboxRoot, 'audit-log.jsonl')
  }
  delete env.ELECTRON_RUN_AS_NODE
  return { env, userData, port: await reservePort() }
}

async function smokeAppImage(path, tempRoot) {
  const extracted = await extractAppImage(path, tempRoot)
  const runtime = await prepareAppImageRuntime(tempRoot)
  let browser
  let child
  try {
    child = spawn(path, [
      '--no-sandbox',
      `--user-data-dir=${runtime.userData}`,
      `--remote-debugging-port=${runtime.port}`
    ], { env: runtime.env, stdio: 'ignore' })
    await waitForSpawn(child, 'package-appimage')
    await waitForCdp(runtime.port)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${runtime.port}`, { timeout: 10_000 })
    const win = await firstCdpPage(browser)
    await win.waitForLoadState('domcontentloaded')
    await win.locator('body').waitFor({ state: 'visible', timeout: 15_000 })
    const bodyTextLength = await win.evaluate(() => document.body?.innerText?.trim().length ?? 0)
    const shellMatches = await win.locator('.sec-btn, .settings-tabs, .nav-item, .rows, .empty, .ob-card').count()
    const url = win.url()
    assert(url === 'app://host' || url.startsWith('app://host/'), `unexpected packaged URL: ${url}`)
    assert(bodyTextLength >= 20, `packaged app is blank: ${bodyTextLength} characters`)
    assert(shellMatches > 0, 'packaged app shell is missing')
    return {
      launchMode: 'appimage-wrapper-cdp',
      payload: extracted.payload,
      url,
      title: await win.title(),
      bodyTextLength,
      shellMatches
    }
  } finally {
    await browser?.close().catch((error) => {
      console.error('[linux-package-smoke] CDP close failed:', String(error).slice(0, 160))
    })
    await terminateProcess(child)
  }
}

async function checkDeb(path, tempRoot) {
  const [name, version, architecture, contents] = await Promise.all([
    command('dpkg-deb', ['--field', path, 'Package']),
    command('dpkg-deb', ['--field', path, 'Version']),
    command('dpkg-deb', ['--field', path, 'Architecture']),
    command('dpkg-deb', ['--contents', path])
  ])
  assert(name === 'rawallmconfig', `unexpected deb package name: ${name}`)
  assert(version === pkg.version, `unexpected deb version: ${version}`)
  assert(architecture === 'amd64', `unexpected deb architecture: ${architecture}`)
  assert(contents.includes('resources/app.asar'), 'deb listing lacks resources/app.asar')
  await command('dpkg', ['--dry-run', '--install', path])
  const target = join(tempRoot, 'deb')
  await mkdir(target)
  await command('dpkg-deb', ['--extract', path, target])
  return {
    name, version, architecture, transaction: 'dpkg --dry-run --install',
    payload: await assertPayload(target, 'deb')
  }
}

async function extractRpm(path, target) {
  const rpm2cpio = spawn('rpm2cpio', [path], { stdio: ['ignore', 'pipe', 'pipe'] })
  const cpio = spawn('cpio', ['-idm', '--quiet'], { cwd: target, stdio: ['pipe', 'ignore', 'pipe'] })
  rpm2cpio.stderr.resume()
  cpio.stderr.resume()
  rpm2cpio.stdout.pipe(cpio.stdin)
  try {
    await Promise.all([waitForExit(rpm2cpio, 'rpm2cpio'), waitForExit(cpio, 'cpio')])
  } finally {
    rpm2cpio.stdout.unpipe(cpio.stdin)
    cpio.stdin.destroy()
    await Promise.all([terminateProcess(rpm2cpio), terminateProcess(cpio)])
  }
}

async function checkRpm(path, tempRoot) {
  const metadata = await command('rpm', ['-qp', '--queryformat', '%{NAME}\n%{VERSION}\n%{ARCH}\n', path])
  const [name, version, architecture] = metadata.split(/\r?\n/)
  const contents = await command('rpm', ['-qpl', path])
  assert(name === 'rawallmconfig', `unexpected rpm package name: ${name}`)
  assert(version === pkg.version, `unexpected rpm version: ${version}`)
  assert(architecture === 'x86_64', `unexpected rpm architecture: ${architecture}`)
  assert(contents.includes('resources/app.asar'), 'rpm listing lacks resources/app.asar')
  const transactionRoot = join(tempRoot, 'rpm-transaction')
  await mkdir(transactionRoot)
  await command('rpm', ['--root', transactionRoot, '--initdb'])
  await command('rpm', ['--root', transactionRoot, '--test', '--nodeps', '-i', path])
  const target = join(tempRoot, 'rpm')
  await mkdir(target)
  await extractRpm(path, target)
  return {
    name, version, architecture, transaction: 'isolated rpm --test --nodeps',
    payload: await assertPayload(target, 'rpm')
  }
}

async function verifyArtifacts() {
  for (const path of Object.values(expected)) await access(path, constants.R_OK)
  const tempRoot = await mkdtemp(join(tmpdir(), 'rawallmconfig-linux-packages-'))
  const appImage = await assertElfAndMode(expected.appImage, 'AppImage')
  return {
    tempRoot,
    appImage: { ...appImage, smoke: await smokeAppImage(expected.appImage, tempRoot) },
    deb: await checkDeb(expected.deb, tempRoot),
    rpm: await checkRpm(expected.rpm, tempRoot)
  }
}

async function writeReport(payload) {
  await mkdir(reportDir, { recursive: true })
  await writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8')
}

try {
  const evidence = await verifyArtifacts()
  await writeReport({ status: 'PASS', generatedAt: new Date().toISOString(), version: pkg.version, evidence })
  console.log(JSON.stringify({ status: 'PASS', report: reportPath }, null, 2))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  await writeReport({ status: 'FAIL', generatedAt: new Date().toISOString(), version: pkg.version, expected, error: message })
  console.error(JSON.stringify({ status: 'FAIL', report: reportPath, error: message }, null, 2))
  process.exitCode = 1
}
