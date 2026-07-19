// Sicherer User-Env-Migrate-Service fuer Windows und Linux.
// Secret-Werte bleiben in stdin/Main; Config-Rewrite ist backup-first und atomar.
import {
  closeSync, fsyncSync, lstatSync, openSync, readFileSync,
  statSync, writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { IpcResult } from '@shared/contract'
import type { EnvMigrateRequest, EnvMigrateResultData } from '@shared/contract-write'
import { exportSnapshot } from './backup'
import { findCredentialLine } from './credential-detect'
import { isSecretPathForRead } from './secret-guard'
import { DEFAULT_ARCHIVE_ROOT } from './backup'
import { isWriteEnabled, WRITE_DISABLED_REASON } from './write-mode'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'
import {
  NODE_FAILED_TEMP_FS, quarantineOwnedFailedTemp, sameFailedIdentity,
  type FailedPathIdentity, type FailedTempFileSystem,
} from './env-migrate-failed-temp'
import {
  type PosixEnvOptions,
} from './env-migrate-posix'
import { posixEnvTransactionAdapter } from './env-migrate-posix-transaction'
import {
  windowsEnvAdapter,
  type WindowsEnvAdapterOptions,
} from './env-migrate-windows'
export { windowsEnvAdapter } from './env-migrate-windows'

export type EnvMigrateResult = IpcResult<EnvMigrateResultData>

type EnvSetter = (varName: string, value: string) => boolean
type EnvUnsetter = (varName: string) => boolean

export interface UserEnvAdapter {
  kind: 'windows' | 'posix'
  set: EnvSetter
  unset: EnvUnsetter
}

function isValidVarName(name: string): boolean {
  return /^[A-Z_][A-Z0-9_]{0,127}$/.test(name)
}

function isRegularFile(p: string): boolean {
  try { return lstatSync(p).isFile() } catch { return false }
}

// Liest exakt die erste von findCredentialLine gewaehlte KEY=VALUE-Zeile.
export function readSecretValue(filePath: string): { value: string } | { reject: string } {
  try {
    const content = readFileSync(filePath, 'utf8')
    const hit = findCredentialLine(content)
    if (hit === null) return { reject: 'no-secret-value-found' }
    if ('reject' in hit) return { reject: 'unsupported-format: nur KEY=VALUE migrierbar' }
    return { value: hit.value }
  } catch {
    return { reject: 'no-secret-value-found' }
  }
}

// macOS bleibt explizit unsupported; kein stiller POSIX-Fallback.
export function userEnvAdapterForPlatform(
  platform: NodeJS.Platform,
  archiveRoot: string,
  posixOptions: PosixEnvOptions = {},
  windowsOptions: WindowsEnvAdapterOptions = {},
): UserEnvAdapter | null {
  if (platform === 'win32') return windowsEnvAdapter(windowsOptions)
  if (platform === 'linux') {
    const options = { ...posixOptions, archiveRoot }
    return posixEnvTransactionAdapter(options)
  }
  return null
}

function effectiveEnvAdapter(
  setEnv: EnvSetter | undefined,
  unsetEnv: EnvUnsetter | undefined,
  platform: NodeJS.Platform,
  archiveRoot: string,
  posixOptions: PosixEnvOptions,
  windowsOptions: WindowsEnvAdapterOptions,
): Pick<UserEnvAdapter, 'set' | 'unset'> | null {
  const selected = userEnvAdapterForPlatform(platform, archiveRoot, posixOptions, windowsOptions)
  if ((!setEnv || !unsetEnv) && selected === null) return null
  return { set: setEnv ?? selected!.set, unset: unsetEnv ?? selected!.unset }
}

interface ConfigRewriteFileSystem extends FailedTempFileSystem {
  mode(path: string): number
  write(path: string, content: string, mode: number, onOwned: () => void): void
  sync(path: string): void
  rename(from: string, to: string): void
}

interface ConfigRewriteOptions {
  fs?: ConfigRewriteFileSystem
  tempToken?: () => string
}

const CONFIG_REWRITE_FS: ConfigRewriteFileSystem = {
  ...NODE_FAILED_TEMP_FS,
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

export function rewriteConfigLine(
  filePath: string,
  varName: string,
  options: ConfigRewriteOptions = {},
): boolean {
  try {
    if (lstatSync(filePath).isSymbolicLink()) return false
    const raw = readFileSync(filePath, 'utf8')
    const hit = findCredentialLine(raw)
    if (hit === null || 'reject' in hit) return false
    const lines = raw.split(/\r?\n/)
    const line = lines[hit.index]
    const eqIdx = line.indexOf('=')
    if (eqIdx < 1) return false
    lines[hit.index] = `${line.slice(0, eqIdx).trim()}=\${${varName}}`
    const fs = options.fs ?? CONFIG_REWRITE_FS
    const token = options.tempToken?.() ?? `${process.pid}-${Date.now()}`
    const tmp = join(dirname(filePath), `.env-migrate-tmp-${token}`)
    const targetMode = fs.mode(filePath) & 0o777
    let ownedIdentity: FailedPathIdentity | null = null
    try {
      fs.write(tmp, lines.join('\n'), 0o600, () => { ownedIdentity = fs.inspect(tmp) })
      fs.sync(tmp)
      fs.rename(tmp, filePath)
    } catch {
      const failedIdentity = fs.inspect(tmp)
      if (sameFailedIdentity(ownedIdentity, failedIdentity)) {
        quarantineOwnedFailedTemp(tmp, { fs, sourceIdentity: failedIdentity! })
      }
      return false
    }
    try { fs.chmod(filePath, targetMode) } catch { /* 0600 bleibt konservativ sicher. */ }
    return true
  } catch {
    return false
  }
}

function validateEnvMigrateReq(
  req: EnvMigrateRequest
): { error: EnvMigrateResult } | { filePath: string; varName: string; secretVal: string } {
  if (!isWriteEnabled()) {
    return { error: { data: null, error: WRITE_DISABLED_REASON } }
  }
  if (!req || typeof req.path !== 'string' || !req.path.trim()) {
    return { error: { data: null, error: 'invalid-request: path fehlt' } }
  }
  if (!req.varName || typeof req.varName !== 'string' || !isValidVarName(req.varName)) {
    return { error: { data: null, error: 'invalid-request: varName ungueltig' } }
  }
  const { path: filePath, varName } = req
  if (!isRegularFile(filePath)) {
    return { error: { data: null, error: 'path-not-a-file' } }
  }
  if (!isSecretPathForRead(filePath)) {
    return { error: { data: null, error: 'not-a-secret-path' } }
  }
  const secret = readSecretValue(filePath)
  if ('reject' in secret) {
    return { error: { data: null, error: secret.reject } }
  }
  return { filePath, varName, secretVal: secret.value }
}

/** Setzt User-Env und schreibt nach Pre-Snapshot die Config auf ${VAR} um. */
export function envMigrate(
  req: EnvMigrateRequest,
  archiveRoot?: string,
  auditPath: string = DEFAULT_AUDIT_PATH,
  setEnv?: EnvSetter,
  unsetEnv?: EnvUnsetter,
  rewriteConfig: (filePath: string, varName: string) => boolean = rewriteConfigLine,
  platform: NodeJS.Platform = process.platform,
  posixOptions: PosixEnvOptions = {},
  windowsOptions: WindowsEnvAdapterOptions = {},
): EnvMigrateResult {
  const validated = validateEnvMigrateReq(req)
  if ('error' in validated) return validated.error
  const { filePath, varName, secretVal } = validated
  const root = archiveRoot ?? DEFAULT_ARCHIVE_ROOT
  const envAdapter = effectiveEnvAdapter(
    setEnv, unsetEnv, platform, root, posixOptions, windowsOptions,
  )
  if (envAdapter === null) return { data: null, error: 'env-platform-unsupported' }

  // Pre-Snapshot ist Pflicht vor jeder Mutation.
  const snap = exportSnapshot(filePath, root)
  if (snap.error) return { data: null, error: `backup-failed: ${snap.error}` }
  if (!snap.data || !snap.data.snapshotPath) return { data: null, error: 'backup-empty' }
  const backupPath = snap.data.snapshotPath

  const varSet = envAdapter.set(varName, secretVal)

  let rewritten = false
  if (varSet) {
    rewritten = rewriteConfig(filePath, varName)
    if (rewritten) appendAudit(makeAuditEntry('env-migrate', filePath, 'ok'), auditPath)
  }

  if (varSet && !rewritten) {
    const reverted = envAdapter.unset(varName)
    return {
      data: { varName, varSet: !reverted, rewritten: false, backupPath },
      error: reverted ? 'config-rewrite-failed-env-rolled-back' : 'config-rewrite-failed-env-partial'
    }
  }

  return {
    data: { varName, varSet, rewritten, backupPath },
    error: varSet ? null : 'env-set-failed'
  }
}
