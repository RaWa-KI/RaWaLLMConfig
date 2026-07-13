import { test, expect } from '@playwright/test'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, sandboxPath } from './fixtures'
import {
  resolveAppImageTarget,
  runAppImageInstall,
  type AppImageSpawnDeps,
} from '../../src/main/services/update-installer-linux'

function fakeSpawn(error = false): AppImageSpawnDeps {
  return {
    spawn: () => {
      const child = new EventEmitter() as EventEmitter & { unref(): void }
      child.unref = () => {}
      setTimeout(() => child.emit(error ? 'error' : 'spawn'), 0)
      return child as never
    },
  }
}

test('resolveAppImageTarget trims APPIMAGE and returns null for blanks', () => {
  expect(resolveAppImageTarget({ APPIMAGE: '  /tmp/RaWa.AppImage  ' })).toBe('/tmp/RaWa.AppImage')
  expect(resolveAppImageTarget({ APPIMAGE: '   ' })).toBe(null)
  expect(resolveAppImageTarget({})).toBe(null)
})

test('missing APPIMAGE target returns appimage-env-missing', async () => {
  const sb = makeSandbox()
  const staged = sandboxPath(sb, 'staged.AppImage')
  writeFileSync(staged, '\u007fELFpayload', 'utf8')
  await expect(runAppImageInstall(staged, null, undefined, fakeSpawn())).resolves.toEqual({
    spawned: false,
    error: 'appimage-env-missing',
  })
})

test('missing staged AppImage returns installer-missing', async () => {
  const sb = makeSandbox()
  const target = sandboxPath(sb, 'installed.AppImage')
  writeFileSync(target, 'old', 'utf8')
  await expect(runAppImageInstall(sandboxPath(sb, 'missing.AppImage'), target, undefined, fakeSpawn()))
    .resolves.toEqual({ spawned: false, error: 'installer-missing' })
})

test('backup-first replace writes target, backup, and relaunches', async () => {
  const sb = makeSandbox()
  const staged = sandboxPath(sb, 'staged.AppImage')
  const target = sandboxPath(sb, 'installed.AppImage')
  writeFileSync(staged, '\u007fELFnew', 'utf8')
  writeFileSync(target, 'old-target', 'utf8')

  const result = await runAppImageInstall(staged, target, undefined, fakeSpawn())

  expect(result).toEqual({ spawned: true, error: null })
  expect(readFileSync(target, 'utf8')).toBe('\u007fELFnew')
  const backupDir = join(sb.configDir, '_replaced')
  expect(existsSync(backupDir)).toBe(true)
  const backups = readdirSync(backupDir)
  expect(backups).toHaveLength(1)
  expect(readFileSync(join(backupDir, backups[0]), 'utf8')).toBe('old-target')
})

test('replace failure rolls back from backup with sanitized error', async () => {
  const sb = makeSandbox()
  const staged = sandboxPath(sb, 'staged.AppImage')
  const target = sandboxPath(sb, 'installed.AppImage')
  writeFileSync(staged, '\u007fELFnew', 'utf8')
  writeFileSync(target, 'old-target', 'utf8')
  const fsDeps = {
    stat: async (path: string) => ({ isFile: () => existsSync(path) }),
    chmod: async () => {},
    mkdir: async (path: string) => { mkdirSync(path, { recursive: true }) },
    copyFile: async (src: string, dest: string) => { writeFileSync(dest, readFileSync(src)) },
    rename: async () => { throw new Error('boom') },
  }

  const result = await runAppImageInstall(staged, target, fsDeps, fakeSpawn())

  expect(result).toEqual({ spawned: false, error: 'appimage-replace-failed' })
  expect(readFileSync(target, 'utf8')).toBe('old-target')
})

test('spawn error returns appimage-relaunch-failed', async () => {
  const sb = makeSandbox()
  const staged = sandboxPath(sb, 'staged.AppImage')
  const target = sandboxPath(sb, 'installed.AppImage')
  writeFileSync(staged, '\u007fELFnew', 'utf8')
  writeFileSync(target, 'old-target', 'utf8')

  const result = await runAppImageInstall(staged, target, undefined, fakeSpawn(true))

  expect(result).toEqual({ spawned: false, error: 'appimage-relaunch-failed' })
})
