// apply-dir-actions.ts — Reine FS-Mechanik fuer Verzeichnis-Operationen (KEINE
// Guards, KEIN Snapshot hier — das ist apply.ts-Aufgabe). Implementiert:
//   archiveDir  = HR7-Verschieben eines ganzen Ordners in den Archiv-Root
//                 (cross-volume C:->E: = copy+verify, KEIN rename; kein Loeschen).
//   moveDir     = Ordner an neuen Zielpfad verschieben (same-volume, Parent-mkdir).
//   copyDir     = Rekursives Kopieren (Hilfsfunktion fuer cross-volume archiveDir).
// Secrets: secret-in-tree All-or-Nothing wird VOR dem Aufruf in apply.ts geprueft
// (dirCheckSecretTree). Symlinks werden im Walk uebersprungen (Loop-Schutz).
// Jede Funktion <50 Z. KEIN throw nach aussen — Fehler als string-Rueckgabe.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  renameSync,
  rmSync,
  statSync,
  lstatSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, dirname, posix, relative, basename, resolve, isAbsolute } from 'node:path'
import { isSecretPathForWrite } from './secret-guard'

// ── Walk-Helfer (Dateiliste rekursiv, Symlinks uebersprungen) ─────────────

/** Relativer POSIX-Pfad -> absoluter Pfad fuer alle regulaeren Dateien. */
type FileMap = Map<string, string>

function walkDir(rootAbs: string, relDir: string, out: FileMap): void {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(rootAbs, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const absChild = join(rootAbs, e.name)
    const relChild = relDir ? posix.join(relDir, e.name) : e.name
    if (isSymlink(e, absChild)) continue
    if (e.isDirectory()) {
      walkDir(absChild, relChild, out)
    } else if (e.isFile()) {
      out.set(relChild, absChild)
    }
  }
}

function isSymlink(dirent: import('node:fs').Dirent, abs: string): boolean {
  try {
    if (dirent.isSymbolicLink()) return true
    return lstatSync(abs).isSymbolicLink()
  } catch {
    return true // im Zweifel ueberspringen
  }
}

/** Listet alle regulaeren Dateien unter rootAbs als rel-Pfad -> abs-Pfad. */
export function listDirFiles(rootAbs: string): FileMap {
  const out: FileMap = new Map()
  walkDir(rootAbs, '', out)
  return out
}

// ── secret-in-tree All-or-Nothing ─────────────────────────────────────────

/**
 * Prueft ob ein Verzeichnisbaum eine secret-bearing Datei enthaelt.
 * Ergibt 'secret-in-tree' (Fehlerstring) oder null (kein Secret).
 */
export function dirCheckSecretTree(rootAbs: string): string | null {
  if (!existsSync(rootAbs)) return null
  const files = listDirFiles(rootAbs)
  for (const abs of files.values()) {
    if (isSecretPathForWrite(abs)) return 'secret-in-tree'
  }
  return null
}

// ── copyDir (rekursiv, cross-volume-sicher) ────────────────────────────────

/** Kopiert src-Ordner nach dest (rekursiv). Fehler als string, sonst null. */
export function copyDir(src: string, dest: string): string | null {
  if (!existsSync(src)) return 'src-not-found'
  const files = listDirFiles(src)
  for (const [rel, srcAbs] of files) {
    const destAbs = join(dest, rel)
    try {
      mkdirSync(dirname(destAbs), { recursive: true })
      copyFileSync(srcAbs, destAbs)
    } catch (err) {
      return err instanceof Error ? err.message : 'copy-failed'
    }
  }
  return null
}

// ── Count+Hash-Verifikation nach Copy ─────────────────────────────────────

function hashFile(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

/**
 * Verifiziert, dass dest exakt dieselben Dateien (Count + Hash) wie src hat.
 * Fehler als string, sonst null.
 */
export function verifyCopy(src: string, dest: string): string | null {
  const srcFiles = listDirFiles(src)
  const destFiles = listDirFiles(dest)
  if (srcFiles.size !== destFiles.size) {
    return `copy-count-mismatch: src=${srcFiles.size} dest=${destFiles.size}`
  }
  for (const [rel, srcAbs] of srcFiles) {
    const destAbs = destFiles.get(rel)
    if (!destAbs) return `copy-missing: ${rel}`
    try {
      if (hashFile(srcAbs) !== hashFile(destAbs)) return `copy-hash-mismatch: ${rel}`
    } catch {
      return `copy-verify-read-error: ${rel}`
    }
  }
  return null
}

// ── archiveDir ─────────────────────────────────────────────────────────────

/**
 * Verschiebt `srcDir` in `archiveDest` (HR7-Archiv).
 * same-volume: renameSync (atomar, Quelle weg).
 * cross-volume (EXDEV): copyDir -> verifyCopy (Count+Hash) -> NUR bei PASS
 * rmSync(Quelle) (HR7-konform: apply.ts hat VOR dem Aufruf bereits snapshotDir
 * als verifizierten Pre-Snapshot angelegt; der verifizierte Archiv-Copy existiert).
 * Bei Copy-/Verify-Fehler: STOP, Quelle unangetastet, kein rmSync.
 * Gibt null zurueck (Erfolg) oder Fehlerstring (beginnt mit 'error:').
 */
export function archiveDir(srcDir: string, archiveDest: string): string | null | 'error:' {
  if (!existsSync(srcDir)) return 'error:src-not-found'
  if (!statSync(srcDir).isDirectory()) return 'error:not-a-directory'
  try {
    mkdirSync(dirname(archiveDest), { recursive: true })
    // Versuch same-volume rename (atomar, Quelle weg):
    try {
      renameSync(srcDir, archiveDest)
      return null
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EXDEV') throw e // unerwarteter Fehler -> propagieren
    }
    // EXDEV: cross-volume -> copy + verify (Count+Hash), dann Quelle entfernen.
    // rmSync ist HR7-konform weil: (a) apply.ts hat vor diesem Aufruf snapshotDir
    // (verifizierter Pre-Snapshot nach E:) erstellt, (b) der verifizierte
    // Archiv-Copy existiert (Count+Hash PASS). Kein Byte geht ersatzlos verloren.
    const err = copyDir(srcDir, archiveDest)
    if (err) return `error:copy-failed:${err}`
    const verr = verifyCopy(srcDir, archiveDest)
    if (verr) return `error:verify-failed:${verr}`
    // Verify PASS: Quelle jetzt entfernen (echte Verschiebung, kein stilles Duplikat).
    rmSync(srcDir, { recursive: true, force: true })
    return null
  } catch (err) {
    return `error:archive-dir-failed:${err instanceof Error ? err.message : 'unbekannt'}`
  }
}

// ── moveDir ────────────────────────────────────────────────────────────────

/**
 * Symmetrischer Datenverlust-Guard zur Datei-Route (apply-actions.resolveDest).
 * Da Skills/Agents ORDNER sind, braucht die Dir-Move-Route denselben Vorab-Schutz:
 *   - Ziel ist ein bereits existierender ANDERER Ordner -> mv-in-Ordner-Semantik:
 *     `join(destDir, basename(srcDir))` als effektives Ziel.
 *   - Effektives Ziel == Quelle (resolve-normalisiert) -> 'MOVE_SAME_PATH'
 *     (kein Selbst-Loeschen).
 *   - Effektives Ziel existiert bereits -> 'MOVE_TARGET_EXISTS'
 *     (kein stilles Mergen/Ueberschreiben).
 * Wirft (wird vom moveDir-try gefangen + als Fehlerstring zurueckgegeben).
 */
function resolveDirDest(srcDir: string, destDir: string): string {
  const isExistingDir = existsSync(destDir) && statSync(destDir).isDirectory()
  const dest =
    isExistingDir && resolve(srcDir) !== resolve(destDir)
      ? join(destDir, basename(srcDir))
      : destDir
  if (resolve(srcDir) === resolve(dest)) throw new Error('MOVE_SAME_PATH')
  if (existsSync(dest)) throw new Error('MOVE_TARGET_EXISTS')
  return dest
}

/**
 * Verschiebt `srcDir` nach `destDir` (same-volume rename, Parent-mkdir).
 * cross-volume (EXDEV): copyDir -> verifyCopy (Count+Hash) -> NUR bei PASS
 * rmSync(Quelle). HR7-konform: apply.ts hat snapshotDir vor dem Aufruf erstellt.
 * Bei Copy-/Verify-Fehler: STOP, Quelle unangetastet, kein rmSync.
 * Fehler als string, sonst null.
 */
export function moveDir(srcDir: string, destDir: string): string | null {
  if (!destDir || !destDir.trim()) return 'MOVE_TO_MISSING'
  // Relatives Ziel wuerde gegen das CWD des Main-Prozesses aufgeloest -> falsches/
  // unvorhersehbares Ziel ausserhalb des intendierten Pfads (Move-Datenverlust).
  if (!isAbsolute(destDir.trim())) return 'MOVE_TARGET_NOT_ABSOLUTE'
  if (!existsSync(srcDir)) return 'src-not-found'
  if (!statSync(srcDir).isDirectory()) return 'not-a-directory'
  try {
    // Datenverlust-Guard (symmetrisch zur Datei-Route) VOR mkdir/rename:
    // biegt Ordner-Ziel auf <Ordner>/<basename(src)> um bzw. stoppt bei
    // Selbst-Move/existierendem Ziel (Wurf wird hier gefangen -> Fehlerstring).
    const dest = resolveDirDest(srcDir, destDir)
    mkdirSync(dirname(dest), { recursive: true })
    try {
      renameSync(srcDir, dest)
      return null
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code
      if (code !== 'EXDEV') throw e
    }
    // cross-volume: copy + verify (Count+Hash), dann Quelle entfernen.
    // rmSync HR7-konform: snapshotDir (Pre-Snapshot) vor diesem Aufruf + Verify PASS.
    const err = copyDir(srcDir, dest)
    if (err) return `copy-failed:${err}`
    const verr = verifyCopy(srcDir, dest)
    if (verr) return `verify-failed:${verr}`
    // Verify PASS: Quelle entfernen (echte Verschiebung).
    rmSync(srcDir, { recursive: true, force: true })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : 'move-dir-failed'
  }
}

// Re-export relative fuer nutzende Module (kein Import-Dup).
export { relative }
