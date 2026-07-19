import { test, expect } from '@playwright/test'
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, readlinkSync, renameSync, statSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { exportSnapshot } from '../../src/main/services/backup'
import { NODE_FAILED_TEMP_FS } from '../../src/main/services/env-migrate-failed-temp'
import {
  setUserEnvPosix, unsetUserEnvPosix, type PosixEnvFileSystem, type PosixEnvOptions,
} from '../../src/main/services/env-migrate-posix'
import { envMigrate, userEnvAdapterForPlatform } from '../../src/main/services/env-migrate'
import { envPlatformFromSystem } from '../../src/renderer/sections/config/EnvMigrateButton'
import { msg } from '../../shared/messages'
import type { System } from '../../shared/contract'
import { setWriteEnabledRuntime, WRITE_DISABLED_REASON } from '../../src/main/services/write-mode'
import { makeSandbox, seedFile } from './fixtures'

const START = '# >>> RaWaLLMConfig env >>>'
const END = '# <<< RaWaLLMConfig env <<<'
interface PosixFixture {
  profilePath: string; options: PosixEnvOptions; env: NodeJS.ProcessEnv; events: string[]
}
test.beforeEach(() => setWriteEnabledRuntime(true))
test.afterEach(() => setWriteEnabledRuntime(null))
function nodeFs(events: string[]): PosixEnvFileSystem {
  return {
    ...NODE_FAILED_TEMP_FS,
    kind: (path) => {
      try {
        const entry = lstatSync(path)
        if (entry.isSymbolicLink()) return 'symlink'
        return entry.isFile() ? 'file' : 'other'
      } catch { return 'missing' }
    },
    link: readlinkSync,
    read: (path) => readFileSync(path, 'utf8'),
    mode: (path) => statSync(path).mode,
    write: (path, content, mode, onOwned) => {
      events.push(`write:${path}:${mode}`)
      const fd = openSync(path, 'wx', mode)
      onOwned()
      try { writeFileSync(fd, content, 'utf8') } finally { closeSync(fd) }
    },
    sync: (path) => {
      events.push(`sync:${path}`)
      const fd = openSync(path, 'r+')
      try { fsyncSync(fd) } finally { closeSync(fd) }
    },
    chmod: (path, mode) => { events.push(`chmod:${mode}`); chmodSync(path, mode) },
    rename: (from, to) => {
      events.push(`rename:${from}->${to}`)
      renameSync(from, to)
    },
  }
}
function makePosixFixture(initial?: string): PosixFixture {
  const sb = makeSandbox()
  const home = join(sb.root, 'home')
  const profilePath = join(home, '.profile')
  mkdirSync(home, { recursive: true })
  if (initial !== undefined) writeFileSync(profilePath, initial, 'utf8')
  const env: NodeJS.ProcessEnv = {}
  const events: string[] = []
  const options: PosixEnvOptions = {
    profilePath,
    archiveRoot: sb.archiveRoot,
    env,
    fs: nodeFs(events),
    tempToken: () => 'spec',
    snapshot: (target, archiveRoot) => {
      events.push(`snapshot:${existsSync(target) ? readFileSync(target, 'utf8') : '<absent>'}`)
      return exportSnapshot(target, archiveRoot)
    },
  }
  return { profilePath, options, env, events }
}
function failingFs(base: PosixEnvFileSystem, stage: 'write' | 'sync' | 'rename'): PosixEnvFileSystem {
  return {
    ...base,
    write: (path, content, mode, onOwned) => {
      base.write(path, content, mode, onOwned)
      if (stage === 'write') throw new Error('write-failed')
    },
    sync: (path) => {
      base.sync(path)
      if (stage === 'sync') throw new Error('sync-failed')
    },
    rename: (from, to) => {
      if (stage === 'rename' && !to.endsWith('artifact.tmp')) throw new Error('rename-failed')
      base.rename(from, to)
    },
  }
}
for (const stage of ['write', 'sync', 'rename'] as const) {
  test(`${stage}-Fehler archiviert Secret-Temp ohne Mutation`, () => {
    const fx = makePosixFixture('# unveraendert\n')
    fx.options.fs = failingFs(fx.options.fs!, stage)

    expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-temp-secret', fx.options)).toBe(false)
    expect(readFileSync(fx.profilePath, 'utf8')).toBe('# unveraendert\n')
    expect(readdirSync(join(fx.profilePath, '..')).sort()).toEqual(['.profile', '_failed'])
    const failedRoot = join(fx.profilePath, '..', '_failed')
    const reservation = readdirSync(failedRoot)[0]
    const artifact = join(failedRoot, reservation, 'artifact.tmp')
    expect(fx.events[1]).toContain(':384')
    expect(fx.env.DUMMY_TOKEN).toBeUndefined()
  })
}
test('.profile-Symlink bleibt erhalten; Ziel, Mode und Snapshot sind korrekt', () => {
  const fx = makePosixFixture()
  const targetDir = join(fx.profilePath, '..', 'profiles')
  const target = join(targetDir, 'login.profile')
  const original = '# symlink-ziel\n'
  mkdirSync(targetDir)
  writeFileSync(target, original, { encoding: 'utf8', mode: 0o600 })
  const mode = statSync(target).mode & 0o777
  symlinkSync(join('profiles', 'login.profile'), fx.profilePath, 'file')
  let snapshotTarget = ''
  fx.options.snapshot = (path, root) => {
    snapshotTarget = path
    return exportSnapshot(path, root)
  }

  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-link-value', fx.options)).toBe(true)
  expect(lstatSync(fx.profilePath).isSymbolicLink()).toBe(true)
  expect(readlinkSync(fx.profilePath)).toBe(join('profiles', 'login.profile'))
  expect(readFileSync(target, 'utf8')).toContain('export DUMMY_TOKEN="dummy-link-value"')
  expect(statSync(target).mode & 0o777).toBe(mode)
  expect(snapshotTarget).toBe(target)
})
test('fehlende .profile: Marker wird atomar angelegt und App-Env wirkt sofort', () => {
  const fx = makePosixFixture()

  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-value', fx.options)).toBe(true)

  expect(readFileSync(fx.profilePath, 'utf8')).toBe(
    `${START}\nexport DUMMY_TOKEN="dummy-value"\n${END}\n`,
  )
  expect(fx.env.DUMMY_TOKEN).toBe('dummy-value')
  expect(fx.events[0]).toBe('snapshot:<absent>')
  expect(fx.events[1]).toContain('.profile.rawallm-tmp-spec')
  expect(fx.events.some((event) => event.includes(`->${fx.profilePath}`))).toBe(true)
  expect(readdirSync(join(fx.profilePath, '..'))).toEqual(['.profile'])
})
test('vorhandene .profile: fremder Inhalt bleibt, Wert ist shell-sicher escaped', () => {
  const original = 'export PATH="$HOME/bin:$PATH"\n# eigener Inhalt\n'
  const fx = makePosixFixture(original)
  const dummy = 'dummy "$HOME" `echo nope` \\ tail'

  expect(setUserEnvPosix('DUMMY_TOKEN', dummy, fx.options)).toBe(true)

  const profile = readFileSync(fx.profilePath, 'utf8')
  expect(profile.startsWith(original)).toBe(true)
  expect(profile).toContain('export DUMMY_TOKEN="dummy \\"\\$HOME\\" \\`echo nope\\` \\\\ tail"')
  expect(profile.match(/RaWaLLMConfig env/g)).toHaveLength(2)
  expect(fx.events[0]).toBe(`snapshot:${original}`)
  const archiveDir = join(String(fx.options.archiveRoot), new Date().toISOString().slice(0, 10) + '-phase2-write')
  const backup = readdirSync(archiveDir).find((name) => name.endsWith('.bak'))
  expect(backup).toBeTruthy()
  expect(readFileSync(join(archiveDir, String(backup)), 'utf8')).toBe(original)
})
test('wiederholtes Set ersetzt genau eine Zeile und erzeugt keinen zweiten Block', () => {
  const fx = makePosixFixture('alias ll="ls -la"\n')

  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-old', fx.options)).toBe(true)
  expect(setUserEnvPosix('DUMMY_TOKEN', 'dummy-new', fx.options)).toBe(true)

  const profile = readFileSync(fx.profilePath, 'utf8')
  expect(profile.match(new RegExp(START.replace(/[>]/g, '\\>'), 'g'))).toHaveLength(1)
  expect(profile.match(/export DUMMY_TOKEN=/g)).toHaveLength(1)
  expect(profile).toContain('export DUMMY_TOKEN="dummy-new"')
  expect(profile).not.toContain('dummy-old')
})

test('Unset entfernt nur die eigene Zeile und ist wiederholbar', () => {
  const initial = [
    'export PATH="$HOME/bin:$PATH"',
    START,
    'export KEEP_TOKEN="dummy-keep"',
    'export DROP_TOKEN="dummy-drop"',
    END,
    '# nach dem Block',
    '',
  ].join('\n')
  const fx = makePosixFixture(initial)
  fx.env.DROP_TOKEN = 'dummy-drop'

  expect(unsetUserEnvPosix('DROP_TOKEN', fx.options)).toBe(true)
  expect(unsetUserEnvPosix('DROP_TOKEN', fx.options)).toBe(true)

  const profile = readFileSync(fx.profilePath, 'utf8')
  expect(profile).toContain('export KEEP_TOKEN="dummy-keep"')
  expect(profile).not.toContain('DROP_TOKEN')
  expect(profile).toContain('export PATH="$HOME/bin:$PATH"')
  expect(profile).toContain('# nach dem Block')
  expect(fx.env.DROP_TOKEN).toBeUndefined()
})

test('Config-Rewrite-Fehler rollt Linux-Profil und App-Env wertfrei zurück', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-rollback-value\n')
  const fx = makePosixFixture('# fremd\n')

  const result = envMigrate(
    { path: config, varName: 'API_TOKEN' },
    sb.archiveRoot,
    sb.auditPath,
    undefined,
    undefined,
    () => false,
    'linux',
    fx.options,
  )

  expect(result.error).toBe('config-rewrite-failed-env-rolled-back')
  expect(readFileSync(fx.profilePath, 'utf8')).toBe('# fremd\n')
  expect(fx.env.API_TOKEN).toBeUndefined()
  expect(JSON.stringify(result)).not.toContain('dummy-rollback-value')
  expect(existsSync(sb.auditPath)).toBe(false)
})

test('Linux-Dispatcher schreibt Config und Audit ohne den Dummy-Wert', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-linux-value\n')
  const fx = makePosixFixture('# fremd\n')

  const result = envMigrate(
    { path: config, varName: 'API_TOKEN' },
    sb.archiveRoot,
    sb.auditPath,
    undefined,
    undefined,
    undefined,
    'linux',
    fx.options,
  )

  expect(result.error).toBeNull()
  expect(readFileSync(config, 'utf8')).toContain('API_TOKEN=${API_TOKEN}')
  expect(readFileSync(fx.profilePath, 'utf8')).toContain('export API_TOKEN="dummy-linux-value"')
  expect(fx.env.API_TOKEN).toBe('dummy-linux-value')
  expect(readFileSync(sb.auditPath, 'utf8')).not.toContain('dummy-linux-value')
  expect(JSON.stringify(result)).not.toContain('dummy-linux-value')
})

test('Schreib-Gate verhindert jede Linux-Profil-Mutation', () => {
  const sb = makeSandbox()
  const config = seedFile(sb, '.env', 'API_TOKEN=dummy-gated-value\n')
  const fx = makePosixFixture('# unverändert\n')
  setWriteEnabledRuntime(false)

  const result = envMigrate(
    { path: config, varName: 'API_TOKEN' },
    sb.archiveRoot,
    sb.auditPath,
    undefined,
    undefined,
    undefined,
    'linux',
    fx.options,
  )

  expect(result.error).toBe(WRITE_DISABLED_REASON)
  expect(readFileSync(fx.profilePath, 'utf8')).toBe('# unverändert\n')
  expect(fx.events).toEqual([])
  expect(fx.env.API_TOKEN).toBeUndefined()
})

test('Dispatcher lässt Windows unverändert und weist macOS explizit ab', () => {
  expect(userEnvAdapterForPlatform('win32', 'unused').kind).toBe('windows')
  expect(userEnvAdapterForPlatform('linux', 'unused').kind).toBe('posix')
  expect(userEnvAdapterForPlatform('darwin', 'unused')).toBeNull()
})

function systemFor(platform: string): System {
  return {
    updated: 'spec',
    areas: [{
      id: 'hardware',
      label: 'Hardware',
      icon: 'cpu',
      blurb: 'Spec',
      entries: [{ id: 'cpu', name: 'Spec CPU', status: 'active', desc: `${platform} spec` }],
    }],
  }
}

test('UI-Texte trennen Windows, Linux und den offenen macOS-Folgeschritt', () => {
  expect(envPlatformFromSystem(systemFor('win32'))).toBe('windows')
  expect(envPlatformFromSystem(systemFor('linux'))).toBe('linux')
  expect(envPlatformFromSystem(systemFor('darwin'))).toBe('unsupported')
  expect(msg('envMigrate.target.windows')).toBe('User-Umgebungsvariable')
  expect(msg('envMigrate.target.linux')).toBe('~/.profile, wirkt nach Neuanmeldung')
  expect(msg('envMigrate.confirm.detail.linux', { varRef: '${DUMMY_TOKEN}' }))
    .toContain('In dieser App wirkt die Variable sofort; neue Anmeldesitzungen erhalten sie nach der nächsten Anmeldung.')
  expect(msg('envMigrate.unavailable.macos')).toContain('noch nicht verfügbar')
})
