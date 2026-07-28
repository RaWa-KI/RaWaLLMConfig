// drift-relation-store.ts — JSON-Persistenz der Nutzer-Festlegungen zu
// Drift-Relationen (Plan 2026-07-20, WP1). Vorbild coverage-ack-store:
// backup-first (HR7-Pre-Snapshot) + atomarer tmp/rename-Write, node:fs.
// Records sind wertfrei (Key + Decision + Zeitstempel, keine Inhalte/Pfade).
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, fsyncSync, closeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DriftDecision, DriftDecisionFile, DriftDecisionRecord } from '@shared/contract-drift'
import { exportSnapshot, DEFAULT_ARCHIVE_ROOT } from './backup'
import { DEFAULT_AUDIT_PATH, appendAudit, makeAuditEntry } from './audit-log'
import { userDataRoot } from './app-paths'

export interface DriftRelationStoreOptions {
  storePath: string
  archiveRoot: string
  auditPath: string
}

const DECISIONS: readonly DriftDecision[] = ['parity', 'duplicate', 'ignored']

function defaultStorePath(): string {
  return join(userDataRoot(), '.rawallmconfig', 'drift-relation-decisions.json')
}

function isSafeKey(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 300 && !/[\r\n\0]/.test(value)
}

function isDecision(value: unknown): value is DriftDecision {
  return typeof value === 'string' && DECISIONS.includes(value as DriftDecision)
}

function isSafeRecord(value: unknown): value is DriftDecisionRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Partial<DriftDecisionRecord>
  return isSafeKey(record.key) && isDecision(record.decision) && typeof record.decidedAt === 'string'
}

function readState(storePath: string): DriftDecisionFile {
  try {
    if (!existsSync(storePath)) return { version: 1, records: [] }
    const value = JSON.parse(readFileSync(storePath, 'utf8')) as Partial<DriftDecisionFile>
    return { version: 1, records: Array.isArray(value.records) ? value.records.filter(isSafeRecord) : [] }
  } catch {
    return { version: 1, records: [] }
  }
}

function writeState(storePath: string, value: DriftDecisionFile): void {
  mkdirSync(dirname(storePath), { recursive: true })
  const temp = `${storePath}.tmp-${process.pid}`
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
  const fd = openSync(temp, 'r+')
  try { fsyncSync(fd) } finally { closeSync(fd) }
  renameSync(temp, storePath)
}

export function createDriftRelationStore(partial?: Partial<DriftRelationStoreOptions>) {
  const options: DriftRelationStoreOptions = {
    storePath: partial?.storePath ?? defaultStorePath(),
    archiveRoot: partial?.archiveRoot ?? DEFAULT_ARCHIVE_ROOT,
    auditPath: partial?.auditPath ?? DEFAULT_AUDIT_PATH,
  }
  return {
    readDecisions(): DriftDecisionRecord[] {
      return readState(options.storePath).records
    },
    writeDecision(key: string, decision: DriftDecision): { ok: boolean; error: string | null } {
      if (!isSafeKey(key) || !isDecision(decision)) return { ok: false, error: 'invalid-input' }
      const state = readState(options.storePath)
      // Revidierbar: gleicher Key ersetzt den bisherigen Eintrag.
      const records = state.records.filter((record) => record.key !== key)
      records.push({ key, decision, decidedAt: new Date().toISOString() })
      if (existsSync(options.storePath)) {
        const snapshot = exportSnapshot(options.storePath, options.archiveRoot)
        if (snapshot.error) return { ok: false, error: snapshot.error }
      }
      try {
        writeState(options.storePath, { version: 1, records })
        appendAudit(makeAuditEntry('drift-write-decision', options.storePath, 'ok'), options.auditPath)
        return { ok: true, error: null }
      } catch {
        return { ok: false, error: 'drift-decision-write-failed' }
      }
    }
  }
}
