// backup.ts — ECHTER HR7-Archiv-Pre-Snapshot vor jeder Mutation (read+copy,
// NIE loeschen). Kopiert die Zieldatei VOR der Mutation in den HR7-Archiv-Root.
// App-Runtime-Default: RAWALLM_ARCHIVE_ROOT oder Electron userData/archive.
// Explizit uebergebene fehlende Roots bleiben `archive-missing`; apply bricht
// dann VOR der Mutation ab.
// Secrets werden nie geloggt; Inhalt wird nur kopiert, nie ausgegeben.
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  statSync,
  writeFileSync,
  readdirSync,
  lstatSync
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { IpcResult } from '@shared/contract'
import { resolveDefaultArchiveRoot, setArchiveRootResolver } from './app-paths'

export { resolveDefaultArchiveRoot, setArchiveRootResolver }

// Runtime-Default fuer Verkaufsapp: Env -> Electron userData/archive -> Node-Fallback.
export const DEFAULT_ARCHIVE_ROOT = resolveDefaultArchiveRoot()

// Ergebnis-Nutzlast eines Pre-Snapshots: wohin kopiert wurde (Name sichtbar).
export interface SnapshotData {
  source: string
  snapshotPath: string
}

export type SnapshotResult = IpcResult<SnapshotData>

// Vertrag fuer den Backup-Adapter (stabil ueber Phasen).
export interface BackupPort {
  backup(targetPath: string, archiveRoot?: string): SnapshotResult
}

// Datum als YYYY-MM-DD fuer den Tages-Archivordner.
function dayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

// Sub-Sekunden-Zeitstempel <HHMMSS-mmm> (UTC). Gemeinsamer Helper fuer snapshot()
// UND archiveDest() — garantiert eindeutige Zielnamen (kein Overwrite, HR7).
function stamp(): string {
  const t = new Date()
  const hh = String(t.getUTCHours()).padStart(2, '0')
  const mm = String(t.getUTCMinutes()).padStart(2, '0')
  const ss = String(t.getUTCSeconds()).padStart(2, '0')
  const ms = String(t.getUTCMilliseconds()).padStart(3, '0')
  return `${hh}${mm}${ss}-${ms}`
}

// Eindeutiger Snapshot-Dateiname: <basename>.<HHMMSS-mmm>.bak (kein Overwrite).
function snapName(src: string): string {
  return `${basename(src)}.${stamp()}.bak`
}

// Pfad des Origin-Sidecars zu einer Backup-Datei (eine Quelle der Wahrheit, von
// archive-restore wiederverwendet). Enthaelt NUR den absoluten Original-Quellpfad
// als String — kein Secret-Wert (Pfade sind in der App ohnehin sichtbar).
export function originSidecarFor(dest: string): string {
  return `${dest}.origin`
}

// Pre-Snapshot anlegen: kopiert `targetPath` in den Tages-Archivordner.
// archive-missing, wenn der Archiv-Root nicht existiert (HR7-STOP, kein Fallback).
function snapshot(targetPath: string, archiveRoot: string): SnapshotResult {
  try {
    if (archiveRoot === DEFAULT_ARCHIVE_ROOT) {
      mkdirSync(archiveRoot, { recursive: true })
    }
    if (!existsSync(archiveRoot)) {
      return { data: null, error: 'archive-missing' }
    }
    if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
      // Nichts zu sichern (z.B. reiner add) — kein Fehler, kein Snapshot.
      return { data: { source: targetPath, snapshotPath: '' }, error: null }
    }
    const dayDir = join(archiveRoot, `${dayStamp()}-phase2-write`)
    mkdirSync(dayDir, { recursive: true })
    const dest = join(dayDir, snapName(targetPath))
    copyFileSync(targetPath, dest)
    // Origin-Sidecar (best-effort): merkt den Original-Quellpfad fuer die spaetere
    // Restore-Vorbelegung. Best-effort, da No-Data-Loss am .bak haengt, nicht am
    // Sidecar — ein Sidecar-Fehler darf den Snapshot-Erfolg NIE kippen. Basename-
    // Schema (`<name>.<stamp>.bak`) bleibt unveraendert, listBackups-Parser bricht
    // nicht. n-a:move-archive-sidecar-folgeschritt — v1 nur write-/restore-Backups
    // (snapshot()-Pfad); Alt-/move-Backups deckt der config.data-Basename-Match ab.
    try {
      writeFileSync(originSidecarFor(dest), targetPath, 'utf8')
    } catch (e) {
      console.error('[backup:origin]', e instanceof Error ? e.message : 'sidecar-error')
    }
    return { data: { source: targetPath, snapshotPath: dest }, error: null }
  } catch (err) {
    console.error('[backup]', err instanceof Error ? err.message : 'snapshot-error')
    return { data: null, error: 'backup-failed' }
  }
}

// Freien Zielnamen ATOMAR reservieren: exklusiver Create (`flag: 'wx'`) schlaegt
// fehl, wenn der Name schon existiert — so koennen zwei Archiv-Operationen im
// selben ms NIE denselben Namen waehlen (TOCTOU-frei), auch wenn beide Namen
// vor dem rename ermittelt werden. Die 0-Byte-Platzhalterdatei wird vom rename
// des Aufrufers ersetzt. NIE ein bestehendes Archiv ueberschreiben (HR7).
// Bricht nach 1000 Versuchen mit null ab.
function freeDest(dayDir: string, base: string): string | null {
  for (let i = 0; i < 1000; i++) {
    const candidate = join(dayDir, i === 0 ? `${base}.${stamp()}` : `${base}.${stamp()}-${i}`)
    try {
      writeFileSync(candidate, '', { flag: 'wx' }) // exklusiv: Fehler wenn vorhanden
      return candidate
    } catch {
      // Name bereits reserviert/vorhanden -> naechster Kandidat
    }
  }
  return null
}

// Datei in den Archiv-Root verschieben (HR7-archive statt unlink). Genutzt von
// apply-actions (archive/toggle-Marker). Liefert einen kollisionsfreien Zielpfad
// mit Sub-Sekunden-Stamp; der Aufrufer verschiebt die Quelle dorthin (rename).
export function archiveDest(targetPath: string, archiveRoot: string): IpcResult<string> {
  try {
    if (archiveRoot === DEFAULT_ARCHIVE_ROOT) {
      mkdirSync(archiveRoot, { recursive: true })
    }
    if (!existsSync(archiveRoot)) return { data: null, error: 'archive-missing' }
    const dayDir = join(archiveRoot, `${dayStamp()}-phase2-archive`)
    mkdirSync(dayDir, { recursive: true })
    const dest = freeDest(dayDir, basename(targetPath))
    if (!dest) return { data: null, error: 'archive-failed' }
    return { data: dest, error: null }
  } catch (err) {
    console.error('[backup]', err instanceof Error ? err.message : 'archive-dest-error')
    return { data: null, error: 'archive-failed' }
  }
}

// ── snapshotDir (rekursiver HR7-Pre-Snapshot eines Verzeichnisses) ──────────
// Kopiert ALLE regulaeren Dateien (Symlinks uebersprungen) rekursiv in einen
// Tages-Archivordner unter archiveRoot. archive-missing wenn Root fehlt (STOP).
// Leeres/fehlendes snapshotPath im Ergebnis = HARTER Abbruch-Trigger in apply.

export interface SnapshotDirData {
  source: string
  snapshotPath: string // Pfad des kopierten Ordners im Archiv (nie leer bei success)
  fileCount: number
}

export type SnapshotDirResult = IpcResult<SnapshotDirData>

// Rekursiver Copy eines Verzeichnisses nach destDir (Symlinks uebersprungen).
// walkDir-Muster, inline damit keine Zirkular-Dep entsteht.
function walkDirCopy(abs: string, rel: string, destDir: string): void {
  let entries: import('node:fs').Dirent[]
  try { entries = readdirSync(abs, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const childAbs = join(abs, e.name)
    const childRel = rel ? `${rel}/${e.name}` : e.name
    let isSym = false
    try { isSym = e.isSymbolicLink() || lstatSync(childAbs).isSymbolicLink() } catch { isSym = true }
    if (isSym) continue
    if (e.isDirectory()) { walkDirCopy(childAbs, childRel, destDir); continue }
    if (!e.isFile()) continue
    const childDest = join(destDir, childRel)
    mkdirSync(dirname(childDest), { recursive: true })
    copyFileSync(childAbs, childDest)
  }
}

// Zaehlt regulaere Dateien rekursiv in abs (fuer Verifikation durch den Aufrufer).
function countDirFiles(abs: string): number {
  let n = 0
  try {
    const entries = readdirSync(abs, { withFileTypes: true })
    for (const e of entries) {
      if (e.isDirectory()) n += countDirFiles(join(abs, e.name))
      else if (e.isFile()) n++
    }
  } catch { /* ignorieren */ }
  return n
}

function snapshotDirImpl(srcDir: string, archiveRoot: string): SnapshotDirResult {
  try {
    if (archiveRoot === DEFAULT_ARCHIVE_ROOT) {
      mkdirSync(archiveRoot, { recursive: true })
    }
    if (!existsSync(archiveRoot)) {
      return { data: null, error: 'archive-missing' }
    }
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
      return { data: null, error: 'src-not-a-directory' }
    }
    const dayDir = join(archiveRoot, `${dayStamp()}-phase2-snapshot`)
    const destDir = join(dayDir, `${basename(srcDir)}.${stamp()}.snap`)
    mkdirSync(destDir, { recursive: true })
    walkDirCopy(srcDir, '', destDir)
    const fileCount = countDirFiles(destDir)
    if (fileCount === 0 && countDirFiles(srcDir) > 0) {
      // Snapshot produzierte 0 Dateien obwohl Quelle nicht leer -> Fehler.
      return { data: null, error: 'snapshot-empty' }
    }
    return { data: { source: srcDir, snapshotPath: destDir, fileCount }, error: null }
  } catch (err) {
    console.error('[backup:snapshotDir]', err instanceof Error ? err.message : 'snapshot-dir-error')
    return { data: null, error: 'backup-failed' }
  }
}

/**
 * Rekursiver HR7-Pre-Snapshot eines ganzen Verzeichnisses.
 * archive-missing wenn Archiv-Root fehlt (STOP, kein Fallback).
 * Leeres/fehlendes snapshotPath-Ergebnis signalisiert apply.ts: harter Abbruch VOR Mutation.
 */
export function snapshotDir(srcDir: string, archiveRoot: string = DEFAULT_ARCHIVE_ROOT): SnapshotDirResult {
  return snapshotDirImpl(srcDir, archiveRoot)
}

// Kollisionsfreien VERZEICHNIS-Zielnamen berechnen OHNE Platzhalter-Datei.
// freeDest reserviert via exklusivem writeFileSync (fuer Dateien korrekt),
// ist aber fuer Ordner falsch (renameSync(dir->existierende Datei) bricht).
// archiveDestDir berechnet daher nur per Existenz-Check-Schleife einen freien
// Ordner-Namen und reserviert ihn NICHT (pure Name-Berechnung, keine FS-Mutation).
// Bricht nach 1000 Versuchen mit null ab. Callee darf renameSync/copyDir direkt nutzen.
export function archiveDestDir(dirPath: string, archiveRoot: string): IpcResult<string> {
  try {
    if (archiveRoot === DEFAULT_ARCHIVE_ROOT) {
      mkdirSync(archiveRoot, { recursive: true })
    }
    if (!existsSync(archiveRoot)) return { data: null, error: 'archive-missing' }
    const dayDir = join(archiveRoot, `${dayStamp()}-phase2-archive`)
    mkdirSync(dayDir, { recursive: true })
    const base = basename(dirPath)
    for (let i = 0; i < 1000; i++) {
      const candidate = join(dayDir, i === 0 ? `${base}.${stamp()}` : `${base}.${stamp()}-${i}`)
      if (!existsSync(candidate)) return { data: candidate, error: null }
    }
    return { data: null, error: 'archive-failed' }
  } catch (err) {
    console.error('[backup]', err instanceof Error ? err.message : 'archive-dest-dir-error')
    return { data: null, error: 'archive-failed' }
  }
}

// Adapter-Instanz (pfad-injizierbar via 2. Argument).
export const backup: BackupPort = {
  backup(targetPath: string, archiveRoot: string = DEFAULT_ARCHIVE_ROOT): SnapshotResult {
    return snapshot(targetPath, archiveRoot)
  }
}

// Direkter Export fuer Tests/apply (ohne Port-Indirektion).
export function exportSnapshot(targetPath: string, archiveRoot: string = DEFAULT_ARCHIVE_ROOT): SnapshotResult {
  return snapshot(targetPath, archiveRoot)
}
