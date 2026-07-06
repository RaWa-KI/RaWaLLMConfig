// apply-actions.ts — Implementierung der 5 Schreib-Aktionen (edit/add/archive/
// move/toggle). ATOMAR: tmp-Datei IMMER im Zielverzeichnis (`<ziel>.tmp-<pid>`),
// nie os.tmpdir() -> garantiert same-volume + atomarer rename. remove=archivieren
// (HR7, KEIN unlink). Backup-/Guard-Reihenfolge orchestriert apply.ts; hier nur
// die Datei-Operationen. Jede Funktion <50 Z. Secrets werden nie geschrieben.
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
  statSync,
  copyFileSync,
  rmSync,
  readFileSync
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, basename, resolve, isAbsolute } from 'node:path'
import type { WriteRequest, WriteResultData } from '@shared/contract-write'
import { archiveDest } from './backup'

// Optionen, die apply.ts durchreicht (Archiv-Root injizierbar fuer Tests).
export interface ActionOptions {
  archiveRoot: string
}

// Datei verschieben (same-volume rename; cross-volume C:->E: copy+hash-verify+rm).
// HR7-konform: apply.ts hat VOR dem Aufruf via backupAdapter.backup einen
// verifizierten Pre-Snapshot der Quelle angelegt; rmSync entfernt die Quelle erst
// NACH bestaetigtem byte-identischem Ziel (kein ersatzloser Verlust). Genutzt von
// doArchive/doMove, damit owner-freie Ziele auf anderem Laufwerk funktionieren
// (renameSync wuerde dort mit EXDEV scheitern).
// HINWEIS: moveFile bleibt bewusst OHNE Datenverlust-Guard, weil es von
// doArchive (eindeutiges archiveDest-Ziel) UND doMove geteilt wird. Der
// Move-spezifische Guard (resolveDest) laeuft NUR in doMove — sonst feuert
// MOVE_TARGET_EXISTS faelschlich beim Archivieren (HR7) und bricht reconcileFolder.
function moveFile(srcPath: string, destPath: string): void {
  mkdirSync(dirname(destPath), { recursive: true })
  try {
    renameSync(srcPath, destPath)
    return
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
  }
  copyFileSync(srcPath, destPath)
  const srcHash = createHash('sha256').update(readFileSync(srcPath)).digest('hex')
  const destHash = createHash('sha256').update(readFileSync(destPath)).digest('hex')
  if (srcHash !== destHash) throw new Error('cross-volume-verify-failed')
  rmSync(srcPath, { force: true }) // Verify PASS -> Quelle entfernen (echte Verschiebung)
}

// Pruefen, ob ein Pfad ein existierendes Verzeichnis ist (defensiv: keine throws).
function isDirSafe(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

// Effektiven Ziel-Dateipfad bestimmen und gegen Datenverlust absichern.
// Ordner-Ziel -> in den Ordner hinein; existierende Ziel-Datei oder Selbst-Move
// -> Fehler statt stillem Overwrite/Selbst-Loeschen (apply.ts loggt error,
// backup-first haelt die Quelle sicher).
function resolveDest(srcPath: string, destPath: string): string {
  const dest = isDirSafe(destPath) ? join(destPath, basename(srcPath)) : destPath
  if (resolve(srcPath) === resolve(dest)) throw new Error('MOVE_SAME_PATH')
  if (existsSync(dest)) throw new Error('MOVE_TARGET_EXISTS')
  return dest
}

// Atomarer Write: tmp-Datei IM Zielverzeichnis schreiben, fsync, dann rename.
function atomicWrite(targetPath: string, content: string): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}`
  writeFileSync(tmp, content, 'utf8')
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, targetPath)
}

// edit: existierende Datei atomar mit neuem Inhalt ersetzen.
function doEdit(req: WriteRequest): WriteResultData {
  if (!existsSync(req.path)) throw new Error('NOT_FOUND')
  atomicWrite(req.path, req.content ?? '')
  return { action: 'edit', path: req.path, backupPath: null }
}

// add: neue Datei anlegen. Existierendes Ziel -> Snapshot-Pflicht (apply.ts
// hat dann bereits gesichert); reiner add (Datei fehlt) braucht kein Backup.
function doAdd(req: WriteRequest): WriteResultData {
  atomicWrite(req.path, req.content ?? '')
  return { action: 'add', path: req.path, backupPath: null }
}

// archive (= remove): Datei in HR7-Archiv-Root verschieben, NIE loeschen.
// archiveDest liegt auf E: -> moveFile faengt EXDEV (cross-volume) ab.
function doArchive(req: WriteRequest, opts: ActionOptions): WriteResultData {
  if (!existsSync(req.path)) throw new Error('NOT_FOUND')
  const dest = archiveDest(req.path, opts.archiveRoot)
  if (dest.error || !dest.data) throw new Error(dest.error ?? 'archive-failed')
  moveFile(req.path, dest.data)
  return { action: 'archive', path: req.path, backupPath: null, movedTo: dest.data }
}

// move: Datei an neuen Zielpfad verschieben (Parent-mkdir; kein Overwrite ohne to).
// Finding A: req.to darf jedes absolute Ziel sein (auch anderes Laufwerk) ->
// moveFile faengt EXDEV mit copy+hash-verify+rm ab.
function doMove(req: WriteRequest): WriteResultData {
  if (!req.to || !req.to.trim()) throw new Error('MOVE_TO_MISSING') // leer ODER reiner Whitespace
  // Relatives Ziel wuerde gegen das CWD des Main-Prozesses aufgeloest -> falsches/
  // unvorhersehbares Ziel ausserhalb des intendierten Pfads (Move-Datenverlust).
  if (!isAbsolute(req.to.trim())) throw new Error('MOVE_TARGET_NOT_ABSOLUTE')
  if (!existsSync(req.path)) throw new Error('NOT_FOUND')
  // Datenverlust-Guard NUR fuer den echten Move (Ordner-Ziel -> in den Ordner,
  // Selbst-Move/existierendes Ziel -> Fehler statt Overwrite/Verlust). NICHT in
  // moveFile, weil archive dieselbe Funktion mit eindeutigem Ziel nutzt.
  const dest = resolveDest(req.path, req.to)
  moveFile(req.path, dest)
  return { action: 'move', path: req.path, backupPath: null, movedTo: dest }
}

// toggle: Status active<->archived per Sidecar-Marker idempotent schalten.
// Backup-Semantik (klar definiert): die ORIGINALDATEI (req.path) bleibt IMMER
// unangetastet — nur der `.archived`-Sidecar-Marker wechselt. Marker NICHT
// vorhanden -> Marker setzen (= archived). Marker vorhanden -> Marker in den
// HR7-Archiv-Root verschieben (statt `.removed-<pid>` neben der Quelle zu
// akkumulieren); danach ist der Status wieder active. Idempotent: erneuter
// toggle auf denselben Zielstatus erzeugt denselben Endzustand.
function doToggle(req: WriteRequest, opts: ActionOptions): WriteResultData {
  if (!existsSync(req.path)) throw new Error('NOT_FOUND')
  const marker = join(dirname(req.path), `${baseName(req.path)}.archived`)
  if (existsSync(marker)) {
    const dest = archiveDest(marker, opts.archiveRoot)
    if (dest.error || !dest.data) throw new Error(dest.error ?? 'archive-failed')
    moveFile(marker, dest.data) // Marker HR7-archiviert (cross-volume-sicher), nicht geloescht
  } else {
    atomicWrite(marker, '1')
  }
  return { action: 'toggle', path: req.path, backupPath: null }
}

// Basisnamen ohne path-Import-Dopplung (klein gehalten).
function baseName(p: string): string {
  const norm = p.replace(/\\/g, '/')
  return norm.slice(norm.lastIndexOf('/') + 1)
}

// Dispatch der Aktion (apply.ts ruft NACH guard+backup auf).
export function runAction(req: WriteRequest, opts: ActionOptions): WriteResultData {
  switch (req.action) {
    case 'edit':
      return doEdit(req)
    case 'add':
      return doAdd(req)
    case 'archive':
      return doArchive(req, opts)
    case 'move':
      return doMove(req)
    case 'toggle':
      return doToggle(req, opts)
    default:
      throw new Error('UNKNOWN_ACTION')
  }
}

// Hilfsexport: prueft, ob eine Aktion (ausser reinem add auf neue Datei) ein
// Backup braucht. add auf existierendes Ziel braucht ebenfalls Backup.
// toggle benoetigt kein Backup der Originaldatei: doToggle beruehrt req.path
// nicht — nur der .archived-Sidecar-Marker wechselt (HR7-Nachweis ueber den
// archivierten Marker selbst; ein Backup der unveraenderten Quelle waere
// sinnlos und im Audit-Log irrefuehrend).
export function needsBackup(req: WriteRequest): boolean {
  if (req.action === 'add') return existsSync(req.path) && statSync(req.path).isFile()
  if (req.action === 'toggle') return false
  return true
}
