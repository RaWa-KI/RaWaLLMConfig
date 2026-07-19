import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { exportSnapshot, DEFAULT_ARCHIVE_ROOT } from './backup'
import { DEFAULT_AUDIT_PATH, appendAudit, makeAuditEntry } from './audit-log'
import { userDataRoot } from './app-paths'

interface CoverageAckFile {
  version: 1
  keys: string[]
}

export interface CoverageAckStoreOptions {
  storePath: string
  archiveRoot: string
  auditPath: string
}

function defaultStorePath(): string {
  return join(userDataRoot(), 'coverage-acks.json')
}

function readState(storePath: string): CoverageAckFile {
  try {
    if (!existsSync(storePath)) return { version: 1, keys: [] }
    const value = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<CoverageAckFile>
    return { version: 1, keys: Array.isArray(value.keys) ? value.keys.filter(isSafeKey) : [] }
  } catch {
    return { version: 1, keys: [] }
  }
}

function isSafeKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\r\n\0]/.test(value)
}

function writeState(storePath: string, value: CoverageAckFile): void {
  mkdirSync(dirname(storePath), { recursive: true })
  const temp = `${storePath}.tmp-${process.pid}`
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
  const fd = openSync(temp, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temp, storePath)
}

export function createCoverageAckStore(partial?: Partial<CoverageAckStoreOptions>) {
  const options: CoverageAckStoreOptions = {
    storePath: partial?.storePath ?? defaultStorePath(),
    archiveRoot: partial?.archiveRoot ?? DEFAULT_ARCHIVE_ROOT,
    auditPath: partial?.auditPath ?? DEFAULT_AUDIT_PATH,
  }
  return {
    readKeys(): string[] {
      return readState(options.storePath).keys
    },
    writeAck(key: string): { ok: boolean; error: string | null } {
      if (!isSafeKey(key)) return { ok: false, error: 'invalid-key' }
      const state = readState(options.storePath)
      if (state.keys.includes(key)) return { ok: true, error: null }
      if (existsSync(options.storePath)) {
        const snapshot = exportSnapshot(options.storePath, options.archiveRoot)
        if (snapshot.error) return { ok: false, error: snapshot.error }
      }
      try {
        writeState(options.storePath, { version: 1, keys: [...state.keys, key] })
        appendAudit(makeAuditEntry('coverage-write-ack', options.storePath, 'ok'), options.auditPath)
        return { ok: true, error: null }
      } catch {
        return { ok: false, error: 'coverage-ack-write-failed' }
      }
    }
  }
}

// coverageEntryKey ist nach shared/contract-coverage.ts gewandert (E-WP3 L1,
// Renderer-Selector baut denselben Key). Re-Export haelt Main-Importe stabil.
export { coverageEntryKey } from '@shared/contract-coverage'
