// Linux-Adapter fuer genau ~/.profile: Snapshot, tmp+fsync+rename, wertfreie Fehler.
// Shell-spezifische rc-Dateien und macOS sind nicht abgedeckt.
import {
  closeSync, fsyncSync, lstatSync, openSync, readFileSync,
  readlinkSync, statSync, writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DEFAULT_ARCHIVE_ROOT, exportSnapshot, type SnapshotResult } from './backup'
import {
  NODE_FAILED_TEMP_FS, quarantineOwnedFailedTemp, sameFailedIdentity,
  type FailedPathIdentity, type FailedTempFileSystem,
} from './env-migrate-failed-temp'

export const POSIX_ENV_MARKER_START = '# >>> RaWaLLMConfig env >>>'
export const POSIX_ENV_MARKER_END = '# <<< RaWaLLMConfig env <<<'

const VAR_NAME_RX = /^[A-Z_][A-Z0-9_]{0,127}$/

export interface PosixEnvFileSystem extends FailedTempFileSystem {
  kind(path: string): 'missing' | 'file' | 'symlink' | 'other'
  link(path: string): string
  read(path: string): string
  mode(path: string): number
  write(path: string, content: string, mode: number, onOwned: () => void): void
  sync(path: string): void
}

export interface PosixEnvOptions {
  profilePath?: string
  archiveRoot?: string
  env?: NodeJS.ProcessEnv
  fs?: PosixEnvFileSystem
  snapshot?: (targetPath: string, archiveRoot: string) => SnapshotResult
  tempToken?: () => string
  beforeArchiveRename?: (sourcePath: string, archivePath: string) => void
}

interface ResolvedOptions {
  profilePath: string
  archiveRoot: string
  env: NodeJS.ProcessEnv
  fs: PosixEnvFileSystem
  snapshot: (targetPath: string, archiveRoot: string) => SnapshotResult
  tempToken: () => string
}

interface ManagedBlock {
  start: number
  end: number
  body: string
}

interface ProfileTarget { path: string; existed: boolean; mode: number }

export interface PosixEnvTransactionState {
  varName: string; target: ProfileTarget; content: string
  runtimeExisted: boolean; runtimeValue?: string
}

function nodeKind(path: string): ReturnType<PosixEnvFileSystem['kind']> {
  try {
    const entry = lstatSync(path)
    if (entry.isSymbolicLink()) return 'symlink'
    return entry.isFile() ? 'file' : 'other'
  } catch (error) {
    return typeof error === 'object' && error !== null
      && 'code' in error && error.code === 'ENOENT' ? 'missing' : 'other'
  }
}

const NODE_FS: PosixEnvFileSystem = {
  ...NODE_FAILED_TEMP_FS,
  kind: nodeKind,
  link: readlinkSync,
  read: (path) => readFileSync(path, 'utf8'),
  mode: (path) => statSync(path).mode,
  write: (path, content, mode, onOwned) => {
    const fd = openSync(path, 'wx', mode)
    onOwned()
    try { writeFileSync(fd, content, 'utf8') } finally { closeSync(fd) }
  },
  sync: (path) => {
    const fd = openSync(path, 'r+')
    try { fsyncSync(fd) } finally { closeSync(fd) }
  },
}

function resolveOptions(options: PosixEnvOptions): ResolvedOptions {
  return {
    profilePath: options.profilePath ?? join(homedir(), '.profile'),
    archiveRoot: options.archiveRoot ?? DEFAULT_ARCHIVE_ROOT,
    env: options.env ?? process.env,
    fs: options.fs ?? NODE_FS,
    snapshot: options.snapshot ?? exportSnapshot,
    tempToken: options.tempToken ?? (() => `${process.pid}-${Date.now()}`),
  }
}

function shellEscapeDoubleQuoted(value: string): string | null {
  if (/[\0\r\n]/.test(value)) return null
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`')
}

function managedBlock(raw: string): ManagedBlock | null | false {
  const starts = [...raw.matchAll(/^# >>> RaWaLLMConfig env >>>\r?$/gm)]
  const ends = [...raw.matchAll(/^# <<< RaWaLLMConfig env <<<\r?$/gm)]
  if (starts.length === 0 && ends.length === 0) return null
  if (starts.length !== 1 || ends.length !== 1) return false
  const start = starts[0].index
  const endMarker = ends[0].index
  if (start === undefined || endMarker === undefined || endMarker < start) return false

  let bodyStart = start + POSIX_ENV_MARKER_START.length
  if (raw.startsWith('\r\n', bodyStart)) bodyStart += 2
  else if (raw.startsWith('\n', bodyStart)) bodyStart += 1
  let bodyEnd = endMarker
  if (raw.slice(0, bodyEnd).endsWith('\r\n')) bodyEnd -= 2
  else if (raw.slice(0, bodyEnd).endsWith('\n')) bodyEnd -= 1
  return {
    start,
    end: endMarker + POSIX_ENV_MARKER_END.length,
    body: raw.slice(bodyStart, Math.max(bodyStart, bodyEnd)),
  }
}

function renderBlock(lines: string[]): string {
  return [POSIX_ENV_MARKER_START, ...lines, POSIX_ENV_MARKER_END].join('\n')
}

function withManagedLines(raw: string, block: ManagedBlock | null, lines: string[]): string {
  const rendered = renderBlock(lines)
  if (block) return raw.slice(0, block.start) + rendered + raw.slice(block.end)
  const separator = raw.length > 0 && !raw.endsWith('\n') ? '\n' : ''
  return `${raw}${separator}${rendered}\n`
}

function withoutManagedBlock(raw: string, block: ManagedBlock): string {
  const before = raw.slice(0, block.start)
  let after = raw.slice(block.end)
  if (before.length === 0 || before.endsWith('\n')) {
    if (after.startsWith('\r\n')) after = after.slice(2)
    else if (after.startsWith('\n')) after = after.slice(1)
  }
  return before + after
}

function managedLines(block: ManagedBlock | null): string[] {
  if (!block || block.body.length === 0) return []
  return block.body.split(/\r?\n/).filter((line) => line.length > 0)
}

function resolveProfileTarget(deps: ResolvedOptions): ProfileTarget | null {
  try {
    const kind = deps.fs.kind(deps.profilePath)
    if (kind === 'missing') return { path: deps.profilePath, existed: false, mode: 0o600 }
    if (kind === 'file') {
      return { path: deps.profilePath, existed: true, mode: deps.fs.mode(deps.profilePath) & 0o777 }
    }
    if (kind !== 'symlink') return null
    const target = resolve(dirname(deps.profilePath), deps.fs.link(deps.profilePath))
    if (deps.fs.kind(target) !== 'file') return null
    return { path: target, existed: true, mode: deps.fs.mode(target) & 0o777 }
  } catch {
    return null
  }
}

function writeWithSnapshot(
  raw: string,
  next: string,
  target: ProfileTarget,
  deps: ResolvedOptions,
): boolean {
  if (raw === next) return true
  const snapshot = deps.snapshot(target.path, deps.archiveRoot)
  if (snapshot.error || !snapshot.data) return false
  if (target.existed && !snapshot.data.snapshotPath) return false
  const tempPath = join(dirname(target.path), `.profile.rawallm-tmp-${deps.tempToken()}`)
  let ownedIdentity: FailedPathIdentity | null = null
  try {
    deps.fs.write(tempPath, next, 0o600, () => { ownedIdentity = deps.fs.inspect(tempPath) })
    deps.fs.sync(tempPath)
    deps.fs.rename(tempPath, target.path)
  } catch {
    const failedIdentity = deps.fs.inspect(tempPath)
    if (sameFailedIdentity(ownedIdentity, failedIdentity)) {
      quarantineOwnedFailedTemp(tempPath, { fs: deps.fs, sourceIdentity: failedIdentity! })
    }
    return false
  }
  try { deps.fs.chmod(target.path, target.mode) } catch { /* 0600 bleibt konservativ sicher. */ }
  return true
}

/** Persistiert eine Variable im begrenzten RaWaLLMConfig-Block von ~/.profile. */
export function setUserEnvPosix(
  varName: string,
  value: string,
  options: PosixEnvOptions = {},
): boolean {
  if (!VAR_NAME_RX.test(varName)) return false
  const escaped = shellEscapeDoubleQuoted(value)
  if (escaped === null) return false
  const deps = resolveOptions(options)
  const target = resolveProfileTarget(deps)
  if (!target) return false
  let raw = ''
  try { if (target.existed) raw = deps.fs.read(target.path) } catch { return false }
  const block = managedBlock(raw)
  if (block === false) return false
  const prefix = `export ${varName}=`
  const lines = managedLines(block).filter((line) => !line.startsWith(prefix))
  lines.push(`${prefix}"${escaped}"`)
  const next = withManagedLines(raw, block, lines)
  if (!writeWithSnapshot(raw, next, target, deps)) return false
  deps.env[varName] = value
  return true
}

/** Entfernt nur die benannte Variable; ein leerer eigener Block verschwindet. */
export function unsetUserEnvPosix(
  varName: string,
  options: PosixEnvOptions = {},
): boolean {
  if (!VAR_NAME_RX.test(varName)) return false
  const deps = resolveOptions(options)
  const target = resolveProfileTarget(deps)
  if (!target) return false
  if (!target.existed) {
    delete deps.env[varName]
    return true
  }
  let raw: string
  try { raw = deps.fs.read(target.path) } catch { return false }
  const block = managedBlock(raw)
  if (block === false) return false
  if (block === null) {
    delete deps.env[varName]
    return true
  }
  const prefix = `export ${varName}=`
  const lines = managedLines(block).filter((line) => !line.startsWith(prefix))
  const next = lines.length > 0 ? withManagedLines(raw, block, lines) : withoutManagedBlock(raw, block)
  if (!writeWithSnapshot(raw, next, target, deps)) return false
  delete deps.env[varName]
  return true
}

export function captureUserEnvPosix(
  varName: string,
  options: PosixEnvOptions,
): PosixEnvTransactionState | null {
  const deps = resolveOptions(options)
  const target = resolveProfileTarget(deps)
  if (!target) return null
  try {
    return {
      varName,
      target,
      content: target.existed ? deps.fs.read(target.path) : '',
      runtimeExisted: Object.prototype.hasOwnProperty.call(deps.env, varName),
      runtimeValue: deps.env[varName],
    }
  } catch { return null }
}

export function restoreUserEnvPosix(
  state: PosixEnvTransactionState,
  options: PosixEnvOptions,
): boolean {
  const deps = resolveOptions(options)
  const current = resolveProfileTarget(deps)
  if (!current || current.path !== state.target.path) return false
  let restored = false
  if (!state.target.existed) restored = unsetUserEnvPosix(state.varName, options)
  else {
    try {
      const raw = deps.fs.read(current.path)
      restored = writeWithSnapshot(raw, state.content, state.target, deps)
    } catch { return false }
  }
  if (!restored) return false
  if (state.runtimeExisted && state.runtimeValue !== undefined) {
    deps.env[state.varName] = state.runtimeValue
  } else delete deps.env[state.varName]
  return true
}
