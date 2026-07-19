import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, lstatSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface FailedPathIdentity {
  dev: number
  ino: number
  kind: 'file' | 'directory' | 'symlink' | 'other'
  mode: number
  mtimeMs: number
  size: number
}

export interface FailedTempFileSystem {
  chmod(path: string, mode: number): void
  enforceModes: boolean
  inspect(path: string): FailedPathIdentity | null
  mkdir(path: string): void
  rename(from: string, to: string): void
}

interface FailedTempOptions {
  beforeRename?: (sourcePath: string, failedPath: string) => void
  fs?: FailedTempFileSystem
  reservationToken?: () => string
  sourceIdentity: FailedPathIdentity
}

function nodeIdentity(path: string): FailedPathIdentity | null {
  try {
    const entry = lstatSync(path)
    const kind = entry.isSymbolicLink() ? 'symlink'
      : entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other'
    return {
      dev: entry.dev, ino: entry.ino, kind, mode: entry.mode & 0o777,
      mtimeMs: entry.mtimeMs, size: entry.size,
    }
  } catch { return null }
}

export const NODE_FAILED_TEMP_FS: FailedTempFileSystem = {
  chmod: chmodSync,
  enforceModes: process.platform !== 'win32',
  inspect: nodeIdentity,
  mkdir: (path) => mkdirSync(path, { mode: 0o700 }),
  rename: renameSync,
}

function isCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && error.code === code
}

export function sameFailedIdentity(
  left: FailedPathIdentity | null,
  right: FailedPathIdentity | null,
  includeContent = false,
): boolean {
  if (!left || !right) return false
  const sameObject = left.dev === right.dev && left.ino === right.ino && left.kind === right.kind
  return sameObject && (!includeContent || (left.size === right.size && left.mtimeMs === right.mtimeMs))
}

function trustedDirectory(
  fs: FailedTempFileSystem,
  path: string,
  expected?: FailedPathIdentity,
): FailedPathIdentity | null {
  const before = fs.inspect(path)
  if (!before || before.kind !== 'directory') return null
  if (expected && !sameFailedIdentity(expected, before)) return null
  try { fs.chmod(path, 0o700) } catch { return null }
  const after = fs.inspect(path)
  if (!sameFailedIdentity(before, after)) return null
  return fs.enforceModes && after!.mode !== 0o700 ? null : after
}

function ensureFailedRoot(fs: FailedTempFileSystem, root: string): FailedPathIdentity | null {
  try { fs.mkdir(root) } catch (error) {
    if (!isCode(error, 'EEXIST')) return null
  }
  return trustedDirectory(fs, root)
}

function opaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 16)
}

interface Reservation { path: string; identity: FailedPathIdentity }

function reserveDirectory(
  fs: FailedTempFileSystem,
  root: string,
  rootIdentity: FailedPathIdentity,
  token: string,
): Reservation | null {
  const opaque = opaqueToken(token)
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const path = join(root, `${opaque}${suffix}`)
    try { fs.mkdir(path) } catch (error) {
      if (isCode(error, 'EEXIST')) continue
      return null
    }
    if (!sameFailedIdentity(rootIdentity, fs.inspect(root))) return null
    const identity = trustedDirectory(fs, path)
    if (!identity) return null
    return { path, identity }
  }
  return null
}

/** Bewahrt ein eindeutig eigenes Fehler-Temp wertfrei und auf demselben Volume. */
export function quarantineOwnedFailedTemp(
  tempPath: string,
  options: FailedTempOptions,
): boolean {
  const fs = options.fs ?? NODE_FAILED_TEMP_FS
  const sourceMatches = () => sameFailedIdentity(options.sourceIdentity, fs.inspect(tempPath), true)
  if (!sourceMatches()) return false
  try { fs.chmod(tempPath, 0o600) } catch { return false }
  if (!sourceMatches()) return false
  const failedRoot = join(dirname(tempPath), '_failed')
  const rootIdentity = ensureFailedRoot(fs, failedRoot)
  if (!rootIdentity) return false
  let token: string
  try { token = options.reservationToken?.() ?? randomUUID() } catch { return false }
  const reserved = reserveDirectory(fs, failedRoot, rootIdentity, token)
  if (!reserved) return false
  const failedPath = join(reserved.path, 'artifact.tmp')
  try { options.beforeRename?.(tempPath, failedPath) } catch { return false }
  if (!sourceMatches()) return false
  if (!sameFailedIdentity(rootIdentity, fs.inspect(failedRoot))) return false
  if (!trustedDirectory(fs, reserved.path, reserved.identity)) return false
  try { fs.rename(tempPath, failedPath) } catch { return false }
  return true
}
