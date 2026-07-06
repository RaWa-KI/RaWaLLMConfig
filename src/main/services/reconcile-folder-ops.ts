// reconcile-folder-ops.ts — Pro-Datei-Executoren fuer den SYMMETRISCHEN Ordner-
// Merge (Finding B). Aus reconcile-folder.ts ausgelagert (HR27: beide Dateien
// <300 Z). Jede Entscheidung archiviert pro Datei die VERLIERER-Seite (HR7,
// kein Loeschen) ueber den apply-Dispatch (guard+backup-first). Secret-Schutz ist
// symmetrisch: die zu mutierende ODER zu archivierende Seite wird vor jeder Aktion
// auf isSecretPathForWrite geprueft -> secret-skip statt Archiv/Edit (HR24).
//   keep-trunk   = Trunk bleibt, Mirror-Datei archiviert.
//   keep-mirror  = Mirror bleibt, Trunk-Datei archiviert (Spiegel zu keep-trunk).
//   adopt-mirror = Mirror-Inhalt -> Trunk (edit/add, backup-first), Mirror archiviert.
//   adopt-trunk  = Trunk-Inhalt  -> Mirror (edit/add, backup-first), Trunk archiviert.
// KEINE eigene FS-/Guard-/Backup-Mechanik — alles laeuft ueber applyWrite.
import { existsSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DirFileEntry } from '@shared/contract'
import type { DirFileReconcileEntry } from '@shared/contract-write-reconcile'
import { applyWrite, type ApplyOptions } from './apply'
import { isSecretPathForWrite } from './secret-guard'

// Datei-Inhalt lesen fuer adopt (sanitisiert, kein Secret-Wert im Log).
function readFile(abs: string): string | null {
  try {
    if (!existsSync(abs) || !statSync(abs).isFile()) return null
    return readFileSync(abs, 'utf8')
  } catch (err) {
    console.error('[reconcile-ops:read]', err instanceof Error ? err.message : 'read-error')
    return null
  }
}

// Ziel-Pfad einer Seite (gleiche rel-Struktur) — fuer adopt-into-other-side.
function sidePath(baseDir: string, rel: string): string {
  return join(baseDir, rel)
}

// Verlierer-Datei pro Datei archivieren (HR7 via apply 'archive'). Secret-Quelle
// -> secret-skip (kein Archiv). Liefert archivedTo oder einen Fehlertext.
function archiveLoser(loserAbs: string, opts: Partial<ApplyOptions>): { archivedTo?: string; error?: string } {
  if (isSecretPathForWrite(loserAbs)) return { error: 'secret-skip' }
  if (!existsSync(loserAbs)) return { archivedTo: undefined } // nichts zu archivieren (idempotent)
  const res = applyWrite({ action: 'archive', path: loserAbs }, opts)
  if (res.error || !res.data) return { error: res.error ?? 'archive-failed' }
  return { archivedTo: res.data.movedTo ?? undefined }
}

// keep-Seite: Gewinner-Seite bleibt, Verlierer-Seite archiviert (ausser skipArchive:
// dann uebernimmt der Aufrufer ein Bulk-Ordner-Archiv der Verlierer-Seite).
function keepSide(
  rel: string,
  decision: 'keep-trunk' | 'keep-mirror',
  loserAbs: string | undefined,
  opts: Partial<ApplyOptions>,
  skipArchive: boolean
): DirFileReconcileEntry {
  if (skipArchive) return { rel, decision } // Bulk-Ordner-Archiv folgt am Ende
  if (!loserAbs) return { rel, decision } // Verlierer-Seite fehlt -> nichts zu tun
  if (isSecretPathForWrite(loserAbs)) return { rel, decision: 'secret-skip' }
  const arch = archiveLoser(loserAbs, opts)
  if (arch.error === 'secret-skip') return { rel, decision: 'secret-skip' }
  if (arch.error) return { rel, decision: 'error', error: arch.error }
  return { rel, decision, archivedTo: arch.archivedTo ?? null }
}

// adopt-Seite: Quell-Inhalt in die Ziel-Seite schreiben (edit/add, backup-first),
// danach die Quell-Seite (Verlierer) archivieren. winnerAbs = Quelle (Inhalt),
// targetDir = Zielordner der Gegenseite. Secret auf einer der Seiten -> secret-skip.
// skipArchive=true: nur der Inhalts-Write laeuft, das Quell-Archiv uebernimmt der
// Aufrufer als Bulk-Ordner-Move (gleiche Verlierer-Seite fuer alle Dateien).
function adoptSide(
  rel: string,
  decision: 'adopt-mirror' | 'adopt-trunk',
  winnerAbs: string | undefined,
  targetDir: string,
  opts: Partial<ApplyOptions>,
  skipArchive: boolean
): DirFileReconcileEntry {
  if (!winnerAbs) return { rel, decision: 'error', error: 'source-path-missing' }
  if (isSecretPathForWrite(winnerAbs)) return { rel, decision: 'secret-skip' }
  const targetAbs = sidePath(targetDir, rel)
  if (isSecretPathForWrite(targetAbs)) return { rel, decision: 'secret-skip' }
  const content = readFile(winnerAbs)
  if (content === null) return { rel, decision: 'error', error: 'source-not-readable' }
  const action = existsSync(targetAbs) ? 'edit' : 'add'
  const wr = applyWrite({ action, path: targetAbs, content }, opts)
  if (wr.error || !wr.data) return { rel, decision: 'error', error: wr.error ?? 'target-write-failed' }
  if (skipArchive) return { rel, decision, backupPath: wr.data.backupPath }
  const arch = archiveLoser(winnerAbs, opts) // Quelle (jetzt redundant) archivieren
  if (arch.error && arch.error !== 'secret-skip') return { rel, decision: 'error', error: arch.error }
  return { rel, decision, backupPath: wr.data.backupPath, archivedTo: arch.archivedTo ?? null }
}

/**
 * Fuehrt EINE Pro-Datei-Entscheidung symmetrisch aus. trunkDir/mirrorDir sind die
 * (normalisierten) Ordnerpfade beider Seiten. skipArchive=true -> die Verlierer-
 * Seite wird NICHT pro Datei archiviert (Aufrufer macht Bulk-Ordner-Archiv, weil
 * ALLE Dateien dieselbe Verlierer-Seite opfern -> F7-Idempotenz: Ordner verschwindet).
 * Bei decision 'error' signalisiert der Aufrufer Abbruch (Partial-Failure-Schutz).
 */
export function runFileDecision(
  entry: DirFileEntry,
  decision: 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk',
  trunkDir: string,
  mirrorDir: string,
  opts: Partial<ApplyOptions>,
  skipArchive = false
): DirFileReconcileEntry {
  const rel = entry.rel
  switch (decision) {
    case 'keep-trunk':
      return keepSide(rel, 'keep-trunk', entry.mirrorPath, opts, skipArchive)
    case 'keep-mirror':
      return keepSide(rel, 'keep-mirror', entry.trunkPath, opts, skipArchive)
    case 'adopt-mirror':
      return adoptSide(rel, 'adopt-mirror', entry.mirrorPath, trunkDir, opts, skipArchive)
    case 'adopt-trunk':
      return adoptSide(rel, 'adopt-trunk', entry.trunkPath, mirrorDir, opts, skipArchive)
  }
}
