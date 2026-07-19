import { test, expect } from '@playwright/test'
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, readlinkSync, renameSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  NODE_FAILED_TEMP_FS, quarantineOwnedFailedTemp,
  type FailedTempFileSystem,
} from '../../src/main/services/env-migrate-failed-temp'
import { rewriteConfigLine } from '../../src/main/services/env-migrate'
import { exportSnapshot } from '../../src/main/services/backup'
import { setUserEnvPosix, type PosixEnvFileSystem } from '../../src/main/services/env-migrate-posix'
import { makeSandbox, seedFile } from './fixtures'

type Failure = 'chmod' | 'mkdir' | 'reserve' | 'rename' | 'root-swap'

interface TestFs {
  fs: FailedTempFileSystem
  modes: Map<string, number>
  operations: string[]
}

function testFs(failure?: Failure): TestFs {
  const modes = new Map<string, number>()
  const operations: string[] = []
  const fs: FailedTempFileSystem = {
    ...NODE_FAILED_TEMP_FS,
    enforceModes: true,
    inspect: (path) => {
      const found = NODE_FAILED_TEMP_FS.inspect(path)
      return found ? { ...found, mode: modes.get(path) ?? found.mode } : null
    },
    chmod: (path, mode) => {
      operations.push(`chmod:${path}:${mode}`)
      if (failure === 'chmod') throw new Error('chmod-failed')
      chmodSync(path, mode)
      modes.set(path, mode)
    },
    mkdir: (path) => {
      const isRoot = path.endsWith('_failed')
      if (failure === 'mkdir' && isRoot) throw new Error('mkdir-failed')
      if (failure === 'reserve' && dirname(path).endsWith('_failed')) throw new Error('reserve-failed')
      mkdirSync(path, { mode: 0o700 })
      modes.set(path, 0o700)
      if (failure === 'root-swap' && dirname(path).endsWith('_failed')) {
        const root = dirname(path)
        renameSync(root, `${root}-held`)
        mkdirSync(root, { mode: 0o700 })
        modes.set(root, 0o700)
      }
    },
    rename: (from, to) => {
      if (failure === 'rename') throw new Error('rename-failed')
      renameSync(from, to)
      const mode = modes.get(from)
      if (mode !== undefined) modes.set(to, mode)
    },
  }
  return { fs, modes, operations }
}

function quarantine(source: string, setup: TestFs, token = 'test-token'): boolean {
  const sourceIdentity = setup.fs.inspect(source)
  if (!sourceIdentity) throw new Error('fixture-source-missing')
  return quarantineOwnedFailedTemp(source, {
    fs: setup.fs,
    reservationToken: () => token,
    sourceIdentity,
  })
}

function failedArtifacts(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root).flatMap((reservation) => {
    const path = join(root, reservation, 'artifact.tmp')
    return existsSync(path) ? [path] : []
  })
}

function posixFs(
  setup: TestFs,
  renameModes: number[],
  failLiveChmod?: string,
): PosixEnvFileSystem {
  return {
    ...setup.fs,
    kind: (path) => {
      const found = setup.fs.inspect(path)
      return !found ? 'missing' : found.kind === 'file' ? 'file'
        : found.kind === 'symlink' ? 'symlink' : 'other'
    },
    link: readlinkSync,
    read: (path) => readFileSync(path, 'utf8'),
    mode: (path) => setup.modes.get(path) ?? statSync(path).mode,
    write: (path, content, mode, onOwned) => {
      const fd = openSync(path, 'wx', mode)
      setup.modes.set(path, mode); onOwned()
      try { writeFileSync(fd, content, 'utf8') } finally { closeSync(fd) }
    },
    sync: (path) => {
      const fd = openSync(path, 'r+')
      try { fsyncSync(fd) } finally { closeSync(fd) }
    },
    chmod: (path, mode) => {
      if (path === failLiveChmod) throw new Error('live-chmod-failed')
      setup.fs.chmod(path, mode)
    },
    rename: (from, to) => {
      renameModes.push(setup.modes.get(from) ?? 0)
      setup.fs.rename(from, to)
    },
  }
}

test('gleicher Token reserviert kollisionsfrei zwei erhaltene 0600-Artefakte', () => {
  const sb = makeSandbox()
  const first = seedFile(sb, 'first.tmp', 'dummy-first-secret')
  const second = seedFile(sb, 'second.tmp', 'dummy-second-secret')
  const setup = testFs()

  expect(quarantine(first, setup, 'same-token')).toBe(true)
  expect(quarantine(second, setup, 'same-token')).toBe(true)
  const artifacts = failedArtifacts(join(dirname(first), '_failed'))
  expect(artifacts).toHaveLength(2)
  expect(artifacts.map((path) => readFileSync(path, 'utf8')).sort())
    .toEqual(['dummy-first-secret', 'dummy-second-secret'])
  expect(artifacts.every((path) => setup.modes.get(path) === 0o600)).toBe(true)
})

for (const failure of ['chmod', 'mkdir', 'reserve', 'rename', 'root-swap'] as const) {
  test(`${failure}-Fehler lässt das eigene Temp am Ursprung erhalten`, () => {
    const sb = makeSandbox()
    const source = seedFile(sb, `${failure}.tmp`, 'dummy-retained-secret')
    expect(quarantine(source, testFs(failure))).toBe(false)
    expect(readFileSync(source, 'utf8')).toBe('dummy-retained-secret')
  })
}

for (const rootKind of ['file', 'symlink'] as const) {
  test(`bestehender _failed-${rootKind} wird nicht vertraut`, () => {
    const sb = makeSandbox()
    const source = seedFile(sb, `${rootKind}.tmp`, 'dummy-root-secret')
    const root = join(dirname(source), '_failed')
    if (rootKind === 'file') writeFileSync(root, 'foreign', 'utf8')
    else {
      mkdirSync(`${root}-target`)
      symlinkSync(`${root}-target`, root, 'junction')
    }
    expect(quarantine(source, testFs())).toBe(false)
    expect(readFileSync(source, 'utf8')).toBe('dummy-root-secret')
  })
}

test('zu weiter _failed-Modus wird vor Nutzung auf 0700 gehärtet', () => {
  const sb = makeSandbox()
  const source = seedFile(sb, 'wide.tmp', 'dummy-wide-secret')
  const root = join(dirname(source), '_failed')
  mkdirSync(root)
  const setup = testFs()
  setup.modes.set(root, 0o777)

  expect(quarantine(source, setup)).toBe(true)
  expect(setup.modes.get(root)).toBe(0o700)
  expect(setup.operations).toContain(`chmod:${root}:448`)
})

test('Secret erscheint weder im Zielpfad noch im Rückgabewert', () => {
  const sb = makeSandbox()
  const secret = 'dummy-path-secret'
  const source = seedFile(sb, 'owned.tmp', secret)
  const setup = testFs()
  const result = quarantine(source, setup, secret)
  const artifact = failedArtifacts(join(dirname(source), '_failed'))[0]

  expect(result).toBe(true)
  expect(artifact).toBeTruthy()
  expect(artifact).not.toContain(secret)
  expect(JSON.stringify(result)).not.toContain(secret)
})

test('Config-Temp bleibt beim Rename 0600 und Zielmodus wird danach restauriert', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-one\nSECOND_TOKEN=dummy-two\n')
  const setup = testFs()
  setup.modes.set(config, 0o640)
  let renameMode = 0
  const fs = {
    ...setup.fs,
    mode: (path: string) => setup.modes.get(path) ?? lstatSync(path).mode,
    write: (path: string, content: string, mode: number, onOwned: () => void) => {
      const fd = openSync(path, 'wx', mode)
      setup.modes.set(path, mode); onOwned()
      try { writeFileSync(fd, content, 'utf8') } finally { closeSync(fd) }
    },
    sync: (path: string) => {
      const fd = openSync(path, 'r+')
      try { fsyncSync(fd) } finally { closeSync(fd) }
    },
    rename: (from: string, to: string) => {
      renameMode = setup.modes.get(from) ?? 0
      setup.fs.rename(from, to)
    },
  }

  expect(rewriteConfigLine(config, 'API_TOKEN', { fs, tempToken: () => 'mode' })).toBe(true)
  expect(renameMode).toBe(0o600)
  expect(setup.modes.get(config)).toBe(0o640)
  expect(readFileSync(config, 'utf8')).toContain('SECOND_TOKEN=dummy-two')

  const conservative = seedFile(sb, 'second.env', 'API_TOKEN=dummy-three\n')
  setup.modes.set(conservative, 0o640)
  fs.chmod = (path, mode) => {
    if (path === conservative) throw new Error('live-chmod-failed')
    setup.fs.chmod(path, mode)
  }
  expect(rewriteConfigLine(conservative, 'API_TOKEN', { fs, tempToken: () => 'safe' })).toBe(true)
  expect(setup.modes.get(conservative)).toBe(0o600)
})

test('POSIX-Temp bleibt beim Rename 0600 und Zielmodus wird danach restauriert', () => {
  const sb = makeSandbox()
  const profile = seedFile(sb, '.profile', '# fremd\n')
  const setup = testFs()
  setup.modes.set(profile, 0o640)
  const renameModes: number[] = []
  const fs = posixFs(setup, renameModes)

  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-posix-secret', {
    profilePath: profile, archiveRoot: sb.archiveRoot, env: {}, fs,
    snapshot: exportSnapshot, tempToken: () => 'posix-mode',
  })).toBe(true)
  expect(renameModes).toEqual([0o600])
  expect(setup.modes.get(profile)).toBe(0o640)
})

test('Fehler beim finalen POSIX-chmod bleibt sicherer 0600-Erfolg', () => {
  const sb = makeSandbox()
  const profile = seedFile(sb, '.profile', '# fremd\n')
  const setup = testFs()
  setup.modes.set(profile, 0o640)
  const fs = posixFs(setup, [], profile)

  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-posix-secret', {
    profilePath: profile, archiveRoot: sb.archiveRoot, env: {}, fs,
    snapshot: exportSnapshot, tempToken: () => 'chmod-fail',
  })).toBe(true)
  expect(setup.modes.get(profile)).toBe(0o600)
  expect(readFileSync(profile, 'utf8')).toContain('export DUMMY_TOKEN=')
})

test('fremdes EEXIST-Temp bleibt beim Config-Rewrite unangetastet', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-config-secret\n')
  const foreign = join(dirname(config), '.env-migrate-tmp-foreign')
  writeFileSync(foreign, 'foreign-byte-identical', 'utf8')

  expect(rewriteConfigLine(config, 'API_TOKEN', { tempToken: () => 'foreign' })).toBe(false)
  expect(readFileSync(config, 'utf8')).toBe('API_TOKEN=dummy-config-secret\n')
  expect(readFileSync(foreign, 'utf8')).toBe('foreign-byte-identical')
  expect(existsSync(join(dirname(config), '_failed'))).toBe(false)
})
