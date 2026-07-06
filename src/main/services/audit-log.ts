// audit-log.ts — Append-only-Audit-Log fuer jede Mutation. Schreibt NUR
// Aktion/Zielpfad-NAME/Ergebnis/Zeitstempel — nie Datei-Inhalt, nie Secret-Wert.
// Append-only-Sonderfall: fs.appendFile + fsync, KEIN tmp+rename (anders als
// apply-Mutationen). Wird NACH erfolgreichem rename der Mutation aufgerufen;
// ein Append-Fehler wird geloggt, bricht die bereits committete Mutation NICHT
// rueckwirkend ab. Pfad ist injizierbar (Test -> temp).
import { appendFileSync, openSync, fsyncSync, closeSync, mkdirSync } from 'node:fs'
import { dirname, basename } from 'node:path'
import type { WriteActionLog } from '@shared/contract-write'
import { auditPath as resolveAuditPath } from './app-paths'

// Default-Audit-Log-Pfad (Produktivlauf). In Tests immer ueberschrieben.
export const DEFAULT_AUDIT_PATH = resolveAuditPath()

// Nur den Basisnamen eines Pfads protokollieren (kein Verzeichnis-/Secret-Leak).
function safeName(p: string): string {
  try {
    return basename(p)
  } catch {
    return '?'
  }
}

// Einen Audit-Eintrag normalisieren (defensiv, ohne Inhalt/Secret).
function toLine(e: WriteActionLog): string {
  const rec: WriteActionLog = {
    ts: e.ts,
    action: e.action,
    path: safeName(e.path),
    result: e.result,
    detail: e.detail ? String(e.detail).slice(0, 120) : undefined,
    // Ziel nur als Basename protokollieren (kein Verzeichnis-/Secret-Leak).
    to: e.to ? safeName(e.to) : undefined
  }
  return JSON.stringify(rec) + '\n'
}

/**
 * Audit-Eintrag append-only schreiben (mit fsync). Wirft NIE: ein Fehler wird
 * auf stderr geloggt (ohne Secret) und still verworfen, weil die eigentliche
 * Mutation bereits gueltig committed ist. Gibt true bei Erfolg zurueck.
 */
export function appendAudit(entry: WriteActionLog, auditPath: string = DEFAULT_AUDIT_PATH): boolean {
  try {
    mkdirSync(dirname(auditPath), { recursive: true })
    appendFileSync(auditPath, toLine(entry), 'utf8')
    const fd = openSync(auditPath, 'r+')
    try {
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    return true
  } catch (err) {
    console.error('[audit]', err instanceof Error ? err.message : 'append-error')
    return false
  }
}

// Komfort: aktuellen Zeitstempel-Eintrag bauen (ISO, UTC). `to` (optional) ist
// der Ziel-Pfad bei move/move-dir/archive; toLine reduziert ihn auf den Basename.
export function makeAuditEntry(
  action: WriteActionLog['action'],
  path: string,
  result: WriteActionLog['result'],
  detail?: string,
  to?: string
): WriteActionLog {
  return { ts: new Date().toISOString(), action, path, result, detail, to }
}
