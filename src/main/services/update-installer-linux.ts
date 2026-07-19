// update-installer-linux.ts - AppImage backup-first ersetzen + neu starten.
// SRP: nur AppImage-Ziel aufloesen, staged AppImage ersetzen, Relaunch starten.
// Kein Pfad/Stack/Secret in Fehlerstrings.
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { dirname, basename, join } from 'node:path'
import {
  chmod as fsChmod,
  copyFile as fsCopyFile,
  mkdir as fsMkdir,
  rename as fsRename,
  stat as fsStat,
} from 'node:fs/promises'

const RELAUNCH_TIMEOUT_MS = 10_000

type InstallError =
  | 'appimage-env-missing'
  | 'installer-missing'
  | 'appimage-chmod-failed'
  | 'appimage-backup-failed'
  | 'appimage-replace-failed'
  | 'appimage-relaunch-failed'

export interface AppImageFsDeps {
  stat(path: string): Promise<{ isFile(): boolean }>
  chmod(path: string, mode: number): Promise<void>
  mkdir(path: string, opts: { recursive: boolean }): Promise<void>
  copyFile(src: string, dest: string): Promise<void>
  rename(src: string, dest: string): Promise<void>
}

export interface AppImageSpawnDeps {
  spawn(file: string, args: string[], opts: { detached: boolean; stdio: 'ignore' }): ChildProcess
}

const defaultFsDeps: AppImageFsDeps = {
  stat: fsStat,
  chmod: fsChmod,
  mkdir: async (path, opts) => { await fsMkdir(path, opts) },
  copyFile: fsCopyFile,
  rename: fsRename,
}

const defaultSpawnDeps: AppImageSpawnDeps = { spawn: nodeSpawn }

export function resolveAppImageTarget(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.APPIMAGE?.trim()
  return value && value.length > 0 ? value : null
}

function backupName(target: string): string {
  const ts = new Date().toISOString().replace(/[^0-9A-Za-z]/g, '')
  return `${ts}_${basename(target)}`
}

async function isFile(path: string, fsDeps: AppImageFsDeps): Promise<boolean> {
  try {
    return (await fsDeps.stat(path)).isFile()
  } catch {
    return false
  }
}

async function chmodExecutable(path: string, fsDeps: AppImageFsDeps): Promise<InstallError | null> {
  try {
    await fsDeps.chmod(path, 0o755)
    return null
  } catch {
    return 'appimage-chmod-failed'
  }
}

async function backupTarget(target: string, fsDeps: AppImageFsDeps): Promise<string | null> {
  try {
    const backupDir = join(dirname(target), '_replaced')
    await fsDeps.mkdir(backupDir, { recursive: true })
    const backupPath = join(backupDir, backupName(target))
    await fsDeps.copyFile(target, backupPath)
    return backupPath
  } catch {
    return null
  }
}

async function restoreBackup(backupPath: string, target: string, fsDeps: AppImageFsDeps): Promise<void> {
  try {
    await fsDeps.copyFile(backupPath, target)
    await fsDeps.chmod(target, 0o755)
  } catch {
    // Best-effort rollback; caller already returns sanitized replace failure.
  }
}

async function replaceTarget(
  stagedPath: string,
  target: string,
  backupPath: string,
  fsDeps: AppImageFsDeps
): Promise<InstallError | null> {
  const nextPath = `${target}.new`
  try {
    await fsDeps.copyFile(stagedPath, nextPath)
    await fsDeps.chmod(nextPath, 0o755)
    await fsDeps.rename(nextPath, target)
    return null
  } catch {
    await restoreBackup(backupPath, target, fsDeps)
    return 'appimage-replace-failed'
  }
}

function relaunch(target: string, spawnDeps: AppImageSpawnDeps): Promise<InstallError | null> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawnDeps.spawn(target, [], { detached: true, stdio: 'ignore' })
    } catch {
      resolve('appimage-relaunch-failed')
      return
    }
    child.unref()
    let settled = false
    const done = (error: InstallError | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(error)
    }
    const timer = setTimeout(() => done(null), RELAUNCH_TIMEOUT_MS)
    child.on('spawn', () => done(null))
    child.on('error', () => done('appimage-relaunch-failed'))
  })
}

export async function runAppImageInstall(
  stagedPath: string,
  target: string | null = resolveAppImageTarget(),
  fsDeps: AppImageFsDeps = defaultFsDeps,
  spawnDeps: AppImageSpawnDeps = defaultSpawnDeps
): Promise<{ spawned: boolean; error: InstallError | null }> {
  if (!target) return { spawned: false, error: 'appimage-env-missing' }
  if (!(await isFile(stagedPath, fsDeps))) return { spawned: false, error: 'installer-missing' }

  const chmodErr = await chmodExecutable(stagedPath, fsDeps)
  if (chmodErr) return { spawned: false, error: chmodErr }

  const backupPath = await backupTarget(target, fsDeps)
  if (!backupPath) return { spawned: false, error: 'appimage-backup-failed' }

  const replaceErr = await replaceTarget(stagedPath, target, backupPath, fsDeps)
  if (replaceErr) return { spawned: false, error: replaceErr }

  const relaunchErr = await relaunch(target, spawnDeps)
  return { spawned: relaunchErr === null, error: relaunchErr }
}
