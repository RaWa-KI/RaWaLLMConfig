// archive-root-guard.spec.ts — Security-Fix 2026-08-14 (unvalidierter
// archiveRoot-Pref): der Renderer-schreibbare Backup-Zielpfad wird fail-closed
// validiert (Set- und Lese-Seite). Boot-Muster wie coverage-ack-ipc.spec.ts:
// electron-Mock im require-cache BEVOR Projekt-Module geladen werden; alle
// Pfade zeigen in eine temp-Sandbox (nie echtes userData, keine Werte im Output).
import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'

const sandbox = mkdtempSync(join(tmpdir(), 'rawallmconfig-archive-root-guard-'))

const electronPath = require.resolve('electron')
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    ipcMain: { handle: () => undefined },
    app: { getPath: () => sandbox }
  }
} as never

// Echter (Nicht-Sandbox-)Zweig von getWriteContext: kein Sandbox-Root, keine
// Env-Overrides — BEVOR write-mode/app-paths geladen werden (Modul-Load-Env).
for (const key of ['RAWALLM_SANDBOX_ROOT', 'RAWALLM_ARCHIVE_ROOT', 'RAWALLM_AUDIT_PATH', 'RAWALLM_WRITE_ENABLED']) {
  delete process.env[key]
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../src/main/services/archive-root-guard') as typeof import('../../src/main/services/archive-root-guard')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appPaths = require('../../src/main/services/app-paths') as typeof import('../../src/main/services/app-paths')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const writeMode = require('../../src/main/services/write-mode') as typeof import('../../src/main/services/write-mode')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const prefsIpc = require('../../src/main/ipc-write-prefs') as typeof import('../../src/main/ipc-write-prefs')

function writePrefsFile(value: string): void {
  const prefsFile = appPaths.prefsPath()
  mkdirSync(join(prefsFile, '..'), { recursive: true })
  writeFileSync(prefsFile, JSON.stringify({ archiveRoot: value }), 'utf8')
}

test('Form-Regeln: relativ, Laufwerks-Root und leer werden abgelehnt', () => {
  expect(guard.archiveRootVerdict('relativer/pfad', []).reason).toBe('not-absolute')
  expect(guard.archiveRootVerdict(parse(process.cwd()).root, []).reason).toBe('drive-root')
  expect(guard.archiveRootVerdict('   ', []).reason).toBe('empty')
})

test('Overlap-Regel: Archiv weder in einem Config-Root noch umgekehrt', () => {
  const configRoot = join(sandbox, '.claude')
  expect(guard.archiveRootVerdict(join(configRoot, 'backups'), [configRoot]).reason).toBe('config-root-overlap')
  expect(guard.archiveRootVerdict(configRoot, [configRoot]).reason).toBe('config-root-overlap')
  expect(guard.archiveRootVerdict(sandbox, [configRoot]).reason).toBe('config-root-overlap')
  expect(guard.archiveRootVerdict(join(sandbox, 'backups'), [configRoot]).ok).toBe(true)
})

test('Symlink-/Junction-Ziele werden abgelehnt', () => {
  const real = join(sandbox, 'real-target')
  mkdirSync(real, { recursive: true })
  const link = join(sandbox, 'archiv-link')
  try {
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch {
    test.skip(true, 'Symlink-Erzeugung auf dieser Plattform nicht moeglich')
  }
  expect(guard.archiveRootVerdict(link, []).reason).toBe('symlink')
})

test('getWriteContext: boesartiger Pref faellt auf den App-Default zurueck', () => {
  writePrefsFile('relativ/boese')
  const ctx = writeMode.getWriteContext()
  expect(ctx.sandboxRoot).toBeNull()
  expect(ctx.archiveRoot).toBe(appPaths.archiveRoot())
  expect(ctx.archiveRoot).not.toContain('relativ')
})

test('getWriteContext: gueltiger absoluter Pref ausserhalb der Config-Roots bleibt wirksam', () => {
  const chosen = join(sandbox, 'gewaehltes-archiv')
  writePrefsFile(chosen)
  const ctx = writeMode.getWriteContext()
  expect(ctx.archiveRoot).toBe(chosen)
})

test('prefs:set lehnt ungueltigen archiveRoot ab, ohne den Store zu beruehren', async () => {
  const res = await prefsIpc.handlePrefsSet({ key: 'archiveRoot', value: 'relativer/pfad' } as never)
  expect(res.data).toBeNull()
  expect(res.error).toBe('invalid-archive-root:not-absolute')
})

test('prefs:set laesst leeren archiveRoot (Reset auf Default) durch', async () => {
  const res = await prefsIpc.handlePrefsSet({ key: 'archiveRoot', value: '' } as never)
  expect(res.error).toBeNull()
  expect(res.data?.key).toBe('archiveRoot')
  expect(existsSync(appPaths.prefsPath())).toBe(true)
})
