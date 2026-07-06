// journal-rollback.ts — Rollback-Exekution für das Integritäts-Journal (W3).
// Kehrt eine teilmutierte Transaktion vollständig um: erst FS-Moves zurück,
// dann überschriebene/gerewritete Dateien aus Snapshot. Liefert den
// Gesamtstatus 'rolled-back' (alles ok) oder 'rollback-failed' (mind. ein Schritt
// fehlgeschlagen). Verändert pro Record den rollbackStatus.
import { copyFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import type { JournalEntry, RollbackAction } from '@shared/contract-integrity'

/** Minimaler Rollback-Kontext pro Journal-Schritt. */
export interface RollbackRecord {
  entry: JournalEntry
  path: string                 // Original-Pfad (Quelle bei move, Zieldatei bei snapshot)
  to?: string                  // Ziel-Pfad bei reverse-move
  snapshotPath?: string        // Pre-Snapshot-Pfad bei restore-snapshot
  action: RollbackAction
}

/** FS-Move umkehren: to -> path. Liefert true bei Erfolg. */
function reverseMove(rec: RollbackRecord): boolean {
  if (!rec.to) return true
  try {
    if (!existsSync(rec.to)) return true // Move kam nie zustande
    mkdirSync(dirname(rec.path), { recursive: true })
    renameSync(rec.to, rec.path)
    return true
  } catch {
    return false
  }
}

/** Datei aus Pre-Snapshot wiederherstellen (Inhalt zurück auf Original-Pfad). */
function restoreSnapshot(rec: RollbackRecord): boolean {
  if (!rec.snapshotPath) return true // nichts gesichert -> nichts wiederherzustellen
  try {
    if (!existsSync(rec.snapshotPath) || !statSync(rec.snapshotPath).isFile()) return true
    mkdirSync(dirname(rec.path), { recursive: true })
    copyFileSync(rec.snapshotPath, rec.path)
    return true
  } catch {
    return false
  }
}

/**
 * Rollback in zwei Wellen: (1) alle reverse-move (verschobene Dateien zurück an
 * den Originalort), (2) alle restore-snapshot (gerewritete Referenzdateien und
 * überschriebene Zieldateien aus Snapshot). Reihenfolge je Welle umgekehrt zur
 * Einfügung (LIFO), damit verschachtelte Moves korrekt aufgelöst werden.
 */
export function runRollback(records: RollbackRecord[]): 'rolled-back' | 'rollback-failed' {
  let ok = true
  const reversed = [...records].reverse()

  for (const rec of reversed) {
    if (rec.action !== 'reverse-move') continue
    const done = reverseMove(rec)
    rec.entry.phase = 'rollback'
    rec.entry.rollbackStatus = done ? 'rolled-back' : 'rollback-failed'
    if (!done) ok = false
  }

  for (const rec of reversed) {
    if (rec.action !== 'restore-snapshot') continue
    const done = restoreSnapshot(rec)
    rec.entry.phase = 'rollback'
    rec.entry.rollbackStatus = done ? 'rolled-back' : 'rollback-failed'
    if (!done) ok = false
  }

  return ok ? 'rolled-back' : 'rollback-failed'
}
