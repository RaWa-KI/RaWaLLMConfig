// reconcile.ts — Dubletten-Einarbeitung mit OWNER-ENTSCHEIDUNG, KEIN Auto-Merge.
// Owner waehlt pro Datei-Paar bewusst, WELCHE Seite ueberlebt (SYMMETRISCH,
// Finding B — wie der Ordner-Reconcile):
//   'keep-trunk'   -> Trunk bleibt unveraendert, Mirror wird archiviert (HR7).
//   'keep-mirror'  -> Mirror bleibt unveraendert, Trunk wird archiviert (Spiegel zu keep-trunk).
//   'adopt-mirror' -> Mirror-Inhalt ersetzt Trunk (Trunk-Pre-Snapshot), DANACH Mirror archiviert.
//   'adopt-trunk'  -> Trunk-Inhalt ersetzt Mirror (Mirror-Pre-Snapshot), DANACH Trunk archiviert.
// Strukturelle Reihenfolge bei adopt: Ziel-Pre-Snapshot (steckt in apply('edit')
// backup-first) -> Ziel-edit -> erst bei Erfolg die QUELLE archivieren. Bei
// edit-Fehler bleibt die Quelle stehen (Abbruch + Fehler-Result).
// Es wird NIE blind geloescht (archive = HR7-Move) und NIE direkt fs geschrieben.
import { readFileSync, statSync } from 'node:fs'
import type {
  ReconcileRequest,
  ReconcilePairDecision,
  ReconcileResult,
  WriteResult
} from '@shared/contract-write'
import { applyWrite, type ApplyOptions } from './apply'
import { isSecretPathForWrite, SECRET_DENY_REASON } from './secret-guard'
import { rewriteReferencesForMove } from './integrity/reference-rewrite'

// Injizierbare Pfade durchreichen (Default real; Test = temp via applyWrite).
type Opts = Partial<ApplyOptions>

// Sanitisiertes Fehl-Result (kein Pfad-Stack/Secret).
function fail(reason: string): ReconcileResult {
  console.error('[reconcile]', reason)
  return { data: null, error: reason }
}

// Datei-Inhalt guard-geprueft lesen (nur fuer adopt-*). null = nicht lesbar.
function readSide(path: string): string | null {
  try {
    if (!statSync(path).isFile()) return null
    return readFileSync(path, 'utf8')
  } catch (err) {
    console.error('[reconcile]', err instanceof Error ? err.message : 'read-failed')
    return null
  }
}

// Datei in den HR7-Archiv-Root verschieben (via apply -> kein Loeschen).
function archiveFile(path: string, opts: Opts): WriteResult {
  return applyWrite({ action: 'archive', path }, opts)
}

function rewriteRefs(loserPath: string, survivorPath: string, opts: Opts): string | null {
  if (!opts.archiveRoot || !opts.auditPath) return null
  const refs = rewriteReferencesForMove(loserPath, survivorPath, {
    archiveRoot: opts.archiveRoot,
    auditPath: opts.auditPath,
    allowedRoots: opts.allowedRoots
  })
  return refs.error
}

// keep-trunk/keep-mirror: Gewinner-Seite bleibt unveraendert, nur die VERLIERER-
// Seite (loserPath) wird archiviert (kein Loeschen, kein edit -> kein Backup).
function keepSide(
  loserPath: string,
  survivorPath: string,
  req: ReconcileRequest,
  decision: ReconcilePairDecision,
  opts: Opts
): ReconcileResult {
  const refErr = rewriteRefs(loserPath, survivorPath, opts)
  if (refErr) return fail(refErr)
  const arch = archiveFile(loserPath, opts)
  if (arch.error || !arch.data) return fail(arch.error ?? 'mirror-archive-failed')
  return {
    data: {
      trunkPath: req.trunkPath,
      mirrorArchivedTo: arch.data.movedTo ?? null,
      trunkBackupPath: null,
      decision
    },
    error: null
  }
}

// adopt-mirror/adopt-trunk: Quell-Inhalt guard-lesen, Ziel atomar+backup-first
// ersetzen, erst NACH Erfolg die Quelle archivieren. srcPath = Sieger-Inhalt,
// destPath = ueberschriebene (verlierende) Seite mit Pre-Snapshot.
function adoptSide(
  srcPath: string,
  destPath: string,
  survivorPath: string,
  req: ReconcileRequest,
  decision: ReconcilePairDecision,
  opts: Opts
): ReconcileResult {
  const refErr = rewriteRefs(srcPath, survivorPath, opts)
  if (refErr) return fail(refErr)
  const content = readSide(srcPath)
  if (content === null) return fail('mirror-not-readable')
  // Ziel-edit (apply macht guard-first + Ziel-Pre-Snapshot + atomar tmp+rename).
  const edit = applyWrite({ action: 'edit', path: destPath, content }, opts)
  if (edit.error || !edit.data) return fail(edit.error ?? 'trunk-edit-failed')
  const backupPath = edit.data.backupPath
  // Erst NACH erfolgreicher Ziel-Einarbeitung die Quelle archivieren.
  const arch = archiveFile(srcPath, opts)
  if (arch.error || !arch.data) return fail(arch.error ?? 'mirror-archive-failed')
  return {
    data: {
      trunkPath: req.trunkPath,
      mirrorArchivedTo: arch.data.movedTo ?? null,
      trunkBackupPath: backupPath,
      decision
    },
    error: null
  }
}

// Gueltige Einzeldatei-Entscheidung (alle 4 symmetrischen Richtungen).
function isKnownDecision(d: ReconcilePairDecision): boolean {
  return d === 'keep-trunk' || d === 'keep-mirror' || d === 'adopt-mirror' || d === 'adopt-trunk'
}

// Request grob validieren (Pfade vorhanden, gueltige Entscheidung).
function invalid(req: ReconcileRequest): string | null {
  if (!req || typeof req.trunkPath !== 'string' || typeof req.mirrorPath !== 'string') {
    return 'invalid-request'
  }
  if (!req.trunkPath || !req.mirrorPath) return 'invalid-request'
  if (!isKnownDecision(req.decision)) return 'invalid-decision'
  return null
}

/**
 * Reconcile ein Trunk/Mirror-Paar gemaess Owner-Entscheidung. KEIN Auto-Merge:
 * der Aufrufer MUSS eine bewusste `decision` setzen (UI: Confirm + sichtbarer Diff).
 * SYMMETRISCH: jede Seite kann ueberleben. secret-bearing Pfade werden hier UND
 * in apply verweigert.
 */
export function reconcile(req: ReconcileRequest, opts: Opts = {}): ReconcileResult {
  const bad = invalid(req)
  if (bad) return fail(bad)
  // Guard-first auch hier (apply guardet erneut): Write-Strenge, secret-bearing
  // (isSecretPathForWrite) -> verweigert. Reconcile mutiert Trunk/Mirror.
  if (isSecretPathForWrite(req.trunkPath) || isSecretPathForWrite(req.mirrorPath)) {
    return fail(SECRET_DENY_REASON)
  }
  switch (req.decision) {
    case 'keep-trunk': // Trunk ueberlebt -> Mirror archivieren.
      return keepSide(req.mirrorPath, req.trunkPath, req, 'keep-trunk', opts)
    case 'keep-mirror': // Mirror ueberlebt -> Trunk archivieren.
      return keepSide(req.trunkPath, req.mirrorPath, req, 'keep-mirror', opts)
    case 'adopt-mirror': // Mirror-Inhalt -> Trunk; Mirror danach archiviert.
      return adoptSide(req.mirrorPath, req.trunkPath, req.trunkPath, req, 'adopt-mirror', opts)
    case 'adopt-trunk': // Trunk-Inhalt -> Mirror; Trunk danach archiviert.
      return adoptSide(req.trunkPath, req.mirrorPath, req.mirrorPath, req, 'adopt-trunk', opts)
  }
}
