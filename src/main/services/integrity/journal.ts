// journal.ts — Transaktionsjournal mit Hashing + Rollback-Exekution (W3).
// Jede Integritäts-Operation registriert hier ihre Snapshots und FS-Moves,
// damit bei Fehler nach Teilmutation ein vollständiger Rollback möglich ist.
// Trägt NIE rohe Secret-Werte — nur Pfade, Hashes und Status.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  JournalEntry,
  JournalPhase,
  RollbackAction,
  RollbackStatus
} from '@shared/contract-integrity'
import { exportSnapshot } from '../backup'
import { runRollback, type RollbackRecord } from './journal-rollback'

/** SHA-256-Hex einer Datei; undefined wenn nicht existent/lesbar. */
export function sha256File(path: string): string | undefined {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return undefined
  }
}

export interface JournalOptions {
  archiveRoot: string
  auditPath: string
}

/** Öffentliches Journal-Handle (Factory-Pattern, kein Class-Export). */
export interface IntegrityJournal {
  snapshot(path: string, kind: string): JournalEntry
  recordMove(from: string, to: string): void
  entries(): JournalEntry[]
  persist(): string
  rollback(): RollbackStatus
}

/** Interner Record: JournalEntry + Rollback-Kontext (from/to/snapshotPath). */
interface InternalRecord extends RollbackRecord {
  entry: JournalEntry
}

export function createJournal(operationId: string, opts: JournalOptions): IntegrityJournal {
  const records: InternalRecord[] = []

  function pushEntry(
    phase: JournalPhase,
    path: string,
    kind: string,
    rollbackAction: RollbackAction,
    extra: { beforeHash?: string; snapshotPath?: string; to?: string }
  ): JournalEntry {
    const entry: JournalEntry = {
      operationId,
      phase,
      path,
      kind,
      beforeHash: extra.beforeHash,
      snapshotPath: extra.snapshotPath,
      rollbackAction,
      rollbackStatus: 'pending'
    }
    records.push({ entry, path, to: extra.to, snapshotPath: extra.snapshotPath, action: rollbackAction })
    return entry
  }

  return {
    // Pre-Snapshot + beforeHash einer Datei VOR Mutation. Existiert die Datei
    // nicht, wird kein snapshotPath gesetzt (nichts wiederherzustellen).
    snapshot(path: string, kind: string): JournalEntry {
      const beforeHash = sha256File(path)
      let snapshotPath: string | undefined
      if (beforeHash !== undefined) {
        const snap = exportSnapshot(path, opts.archiveRoot)
        if (snap.error) throw new Error(snap.error)
        snapshotPath = snap.data?.snapshotPath || undefined
      }
      return pushEntry('snapshot', path, kind, 'restore-snapshot', { beforeHash, snapshotPath })
    },

    // FS-Move registrieren (Rollback = renameSync(to -> from)).
    recordMove(from: string, to: string): void {
      pushEntry('fs', from, 'move', 'reverse-move', { to })
    },

    entries(): JournalEntry[] {
      return records.map((r) => r.entry)
    },

    // Journal als NDJSON in den archiveRoot schreiben; Pfad zurück. Nur
    // Pfade/Hashes/Status — keine Secret-Werte, kein Datei-Inhalt.
    persist(): string {
      const dir = join(opts.archiveRoot, 'integrity-journals')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${operationId}.${randomUUID().slice(0, 8)}.ndjson`)
      const lines = records.map((r) => JSON.stringify(r.entry)).join('\n')
      writeFileSync(file, lines + '\n', 'utf8')
      return file
    },

    // Rollback in umgekehrter Reihenfolge (Detail in journal-rollback.ts).
    rollback(): RollbackStatus {
      return runRollback(records)
    }
  }
}
