import { test, expect } from '@playwright/test'
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  renameSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { envMigrate } from '../../src/main/services/env-migrate'
import { NODE_FAILED_TEMP_FS } from '../../src/main/services/env-migrate-failed-temp'
import type { PosixEnvFileSystem } from '../../src/main/services/env-migrate-posix'
import { setWriteEnabledRuntime } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile } from './fixtures'

test.beforeEach(() => setWriteEnabledRuntime(true))
test.afterEach(() => setWriteEnabledRuntime(null))

function injectedPosixFs(events: string[]): PosixEnvFileSystem {
  return {
    ...NODE_FAILED_TEMP_FS,
    kind: (path) => {
      const entry = NODE_FAILED_TEMP_FS.inspect(path)
      return !entry ? 'missing' : entry.kind === 'file' ? 'file'
        : entry.kind === 'symlink' ? 'symlink' : 'other'
    },
    link: readlinkSync,
    read: (path) => readFileSync(path, 'utf8'),
    mode: (path) => statSync(path).mode,
    write: (path, content, mode, onOwned) => {
      writeFileSync(path, content, { encoding: 'utf8', flag: 'wx', mode })
      onOwned()
    },
    sync: (path) => { events.push(`sync:${path}`) },
    chmod: (path, mode) => { events.push(`chmod:${path}`); chmodSync(path, mode) },
    inspect: (path) => { events.push(`inspect:${path}`); return NODE_FAILED_TEMP_FS.inspect(path) },
    mkdir: (path) => { events.push(`mkdir:${path}`); NODE_FAILED_TEMP_FS.mkdir(path) },
    rename: (from, to) => { events.push(`rename:${to}`); renameSync(from, to) },
  }
}

test('Config-Symlink wird vor Snapshot und jeder Env-Mutation abgelehnt', () => {
  const sb = makeSandbox()
  const targetBody = 'API_TOKEN=dummy-link-transaction\n'
  const target = seedFile(sb, 'real.env', targetBody)
  const link = join(sb.configDir, 'linked.env')
  const profile = join(sb.root, 'home', '.profile')
  mkdirSync(join(sb.root, 'home'))
  writeFileSync(profile, '# profile-unveraendert', 'utf8')
  symlinkSync('real.env', link, 'file')
  const calls: string[] = []
  const runtimeEnv: NodeJS.ProcessEnv = {}

  const result = envMigrate(
    { path: link, varName: 'API_TOKEN' }, sb.archiveRoot, sb.auditPath,
    () => { calls.push('set'); return true },
    () => { calls.push('unset'); return true },
    undefined, 'linux', { profilePath: profile, env: runtimeEnv },
  )

  expect(result).toEqual({ data: null, error: 'path-not-a-file' })
  expect(calls).toEqual([])
  expect(readdirSync(sb.archiveRoot)).toEqual([])
  expect(existsSync(sb.auditPath)).toBe(false)
  expect(runtimeEnv.API_TOKEN).toBeUndefined()
  expect(readFileSync(profile, 'utf8')).toBe('# profile-unveraendert')
  expect(lstatSync(link).isSymbolicLink()).toBe(true)
  expect(readlinkSync(link)).toBe('real.env')
  expect(readFileSync(target, 'utf8')).toBe(targetBody)
})

for (const persistentBefore of ['dummy-old-user-value', undefined] as const) {
  test(`Windows-Rollback restauriert persistent ${persistentBefore ? 'vorhanden' : 'absent'}`, () => {
    const sb = makeSandbox()
    const config = seedFile(sb, '.env', 'API_TOKEN=dummy-new-user-value\n')
    const store = new Map<string, string>()
    if (persistentBefore) store.set('API_TOKEN', persistentBefore)
    const runtimeEnv: NodeJS.ProcessEnv = { API_TOKEN: 'runtime-before' }
    const operations: string[] = []
    const windowsOptions = {
      env: runtimeEnv,
      getPersistent: (name: string) => {
        operations.push(`get:${name}`)
        return store.has(name)
          ? { exists: true as const, value: store.get(name)! }
          : { exists: false as const }
      },
      setPersistent: (name: string, value: string) => {
        operations.push(`set:${name}`); store.set(name, value); return true
      },
      unsetPersistent: (name: string) => {
        operations.push(`unset:${name}`); store.delete(name); return true
      },
    }

    const result = envMigrate(
      { path: config, varName: 'API_TOKEN' }, sb.archiveRoot, sb.auditPath,
      undefined, undefined, () => false, 'win32', {}, windowsOptions,
    )

    expect(result.error).toBe('config-rewrite-failed-env-rolled-back')
    expect(store.get('API_TOKEN')).toBe(persistentBefore)
    expect(runtimeEnv.API_TOKEN).toBe('runtime-before')
    expect(operations).toContain(persistentBefore ? 'set:API_TOKEN' : 'unset:API_TOKEN')
    expect(existsSync(sb.auditPath)).toBe(false)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('dummy-new-user-value')
    if (persistentBefore) expect(serialized).not.toContain(persistentBefore)
  })
}

for (const original of ['# ohne-abschluss', '# erste\r\n# zweite\r\n'] as const) {
  test(`Linux-Rollback restauriert ${original.includes('\r\n') ? 'CRLF' : 'ohne Abschluss'} byte- und mode-exakt`, () => {
    const sb = makeSandbox()
    const config = seedFile(sb, '.env', 'API_TOKEN=dummy-linux-transaction\n')
    const home = join(sb.root, 'home')
    const profile = join(home, '.profile')
    mkdirSync(home)
    writeFileSync(profile, original, { encoding: 'utf8', mode: 0o600 })
    const mode = statSync(profile).mode & 0o777
    const runtimeEnv: NodeJS.ProcessEnv = { API_TOKEN: 'runtime-before' }

    const result = envMigrate(
      { path: config, varName: 'API_TOKEN' }, sb.archiveRoot, sb.auditPath,
      undefined, undefined, () => false, 'linux', { profilePath: profile, env: runtimeEnv },
    )

    expect(result.error).toBe('config-rewrite-failed-env-rolled-back')
    expect(readFileSync(profile, 'utf8')).toBe(original)
    expect(statSync(profile).mode & 0o777).toBe(mode)
    expect(runtimeEnv.API_TOKEN).toBe('runtime-before')
    expect(existsSync(sb.auditPath)).toBe(false)
    expect(JSON.stringify(result)).not.toContain('dummy-linux-transaction')
  })
}

test('Linux-Rollback archiviert transaktional neu erzeugtes Profil und stellt absent her', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-absent-transaction\n')
  const home = join(sb.root, 'home')
  const profile = join(home, '.profile')
  mkdirSync(home)
  const runtimeEnv: NodeJS.ProcessEnv = { API_TOKEN: 'runtime-before' }
  const fsEvents: string[] = []

  const result = envMigrate(
    { path: config, varName: 'API_TOKEN' }, sb.archiveRoot, sb.auditPath,
    undefined, undefined, () => false, 'linux', {
      profilePath: profile, env: runtimeEnv, fs: injectedPosixFs(fsEvents),
    },
  )

  expect(result.error).toBe('config-rewrite-failed-env-rolled-back')
  expect(existsSync(profile)).toBe(false)
  expect(readdirSync(home)).toEqual(['_failed'])
  expect(runtimeEnv.API_TOKEN).toBe('runtime-before')
  const reservations = readdirSync(join(home, '_failed'))
  expect(reservations).toHaveLength(1)
  const archived = join(home, '_failed', reservations[0], 'artifact.tmp')
  expect(statSync(archived).size).toBeGreaterThan(0)
  if (process.platform !== 'win32') expect(statSync(archived).mode & 0o777).toBe(0o600)
  expect(existsSync(sb.auditPath)).toBe(false)
  expect(JSON.stringify(result)).not.toContain('dummy-absent-transaction')
  expect(fsEvents.some((entry) => entry.includes('mkdir:') && entry.includes('_failed'))).toBe(true)
  expect(fsEvents.some((entry) => entry.includes('rename:') && entry.includes('artifact.tmp'))).toBe(true)
})

test('Linux-Rollback meldet bei Source-Swap keinen Scheinerfolg und verliert keine Datei', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-race-transaction\n')
  const home = join(sb.root, 'home')
  const profile = join(home, '.profile')
  const heldOriginal = join(home, '.profile-held')
  mkdirSync(home)
  const runtimeEnv: NodeJS.ProcessEnv = { API_TOKEN: 'runtime-before' }
  let reservedPath = ''

  const result = envMigrate(
    { path: config, varName: 'API_TOKEN' }, sb.archiveRoot, sb.auditPath,
    undefined, undefined, () => false, 'linux', {
      profilePath: profile,
      env: runtimeEnv,
      beforeArchiveRename: (sourcePath: string, archivePath: string) => {
        reservedPath = archivePath
        renameSync(sourcePath, heldOriginal)
        writeFileSync(sourcePath, '# unerwarteter-ersatz\n', 'utf8')
      },
    },
  )

  expect(result.error).toBe('config-rewrite-failed-env-partial')
  expect(runtimeEnv.API_TOKEN).toBe('dummy-race-transaction')
  expect(readFileSync(profile, 'utf8')).toBe('# unerwarteter-ersatz\n')
  expect(existsSync(reservedPath)).toBe(false)
  expect(readFileSync(heldOriginal, 'utf8')).toContain('export API_TOKEN=')
  expect(existsSync(sb.auditPath)).toBe(false)
  expect(JSON.stringify(result)).not.toContain('dummy-race-transaction')
})
