// archive-restore.ts — HR7-Archiv-Liste (read-only stat) + Einzeldatei-Restore.
// listBackups: scannt die Tages-Ordner (*-phase2-write/*-phase2-archive/
//   *-phase2-snapshot) unter archiveRoot, NUR stat (nie Inhalt). archive-missing
//   -> Fehler (kein Fallback).
// restoreBackup: Reihenfolge wie apply.ts — validieren(backupPath unter archiveRoot)
//   -> assertWritable(ownerEdit) + assertInScope -> exportSnapshot(backup-first,
//   nur wenn Ziel existiert) -> atomar tmp+rename -> appendAudit('restore').
//   NIE Loeschung, IMMER Pre-Snapshot vor Overwrite. Sanitisierte Rueckgabe.
import {
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  openSync,
  fsyncSync,
  closeSync,
  renameSync,
  mkdirSync
} from 'node:fs'
import { join, basename, dirname } from 'node:path'
import type { IpcResult } from '@shared/contract'
import type {
  ArchiveBackupEntry,
  ArchiveKind,
  ArchiveListResult,
  ArchiveRestoreRequest,
  ArchiveRestoreResult
} from '@shared/contract-archive'
import { assertWritable } from './secret-guard'
import { assertInScope } from './path-scope'
import { archiveDest, exportSnapshot, originSidecarFor } from './backup'
import { appendAudit, makeAuditEntry } from './audit-log'
import { isPathWithin } from '../lib/path-within'
import { rewriteReferencesForMove } from './integrity/reference-rewrite'

// Restore-Kontext (vom IPC durchgereicht; analog ApplyOptions/WriteContext).
export interface RestoreCtx {
  archiveRoot: string
  auditPath: string
  allowedRoots: string[]
}

// Default-Limit der Liste (sort desc, dann gekuerzt). Mehr -> truncated:true.
const LIST_LIMIT = 500

// Ordner-Suffix -> Backup-Art. Unbekannte Ordner werden ignoriert.
const DAY_KINDS: ReadonlyArray<{ suffix: string; kind: ArchiveKind }> = [
  { suffix: '-phase2-write', kind: 'write' },
  { suffix: '-phase2-archive', kind: 'archive' },
  { suffix: '-phase2-snapshot', kind: 'snapshot' }
]

// YYYY-MM-DD-Praefix aus dem Tages-Ordnernamen (z.B. '2026-06-09-phase2-write').
function dayTagOf(dirName: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(dirName)
  return m ? m[1] : ''
}

// <HHMMSS-mmm> aus einem Backup-Dateinamen ziehen + zu ISO-Zeit (UTC) machen.
// Greift sowohl `<name>.<HHMMSS-mmm>.bak` (write) als auch `<name>.<HHMMSS-mmm>`
// bzw. `...-<i>` (archive) und `<name>.<HHMMSS-mmm>.snap` (snapshot).
function parseStamp(fileName: string, dayTag: string): string {
  const m = /\.(\d{2})(\d{2})(\d{2})-(\d{3})(?:-\d+)?(?:\.(?:bak|snap))?$/.exec(fileName)
  if (!m || !dayTag) return ''
  const iso = `${dayTag}T${m[1]}:${m[2]}:${m[3]}.${m[4]}Z`
  const t = Date.parse(iso)
  return Number.isNaN(t) ? '' : new Date(t).toISOString()
}

// Original-Basename rekonstruieren: den Stamp-Suffix (+ optionales .bak/.snap)
// abschneiden. Faellt auf den vollen Namen zurueck, wenn kein Stamp matcht.
function originalNameOf(fileName: string): string {
  const stripped = fileName.replace(/\.\d{6}-\d{3}(?:-\d+)?(?:\.(?:bak|snap))?$/, '')
  return stripped.length > 0 ? stripped : fileName
}

// Eine einzelne Datei eines Tages-Ordners zu einem Eintrag machen (nur stat).
function toEntry(abs: string, fileName: string, dayTag: string, kind: ArchiveKind): ArchiveBackupEntry | null {
  let size = 0
  try {
    const st = statSync(abs)
    if (!st.isFile()) return null
    size = st.size
  } catch {
    return null
  }
  // Origin-Sidecar (best-effort): wenn `<abs>.origin` existiert, dessen Inhalt
  // (getrimmt) als absoluter Original-Quellpfad fuer die Restore-Vorbelegung lesen.
  // Fehler/fehlender Sidecar -> originalPath bleibt undefined (Alt-Backups).
  let originalPath: string | undefined
  try {
    const sidecar = originSidecarFor(abs)
    if (existsSync(sidecar)) {
      const raw = readFileSync(sidecar, 'utf8').trim()
      if (raw) originalPath = raw
    }
  } catch {
    /* best-effort, kein Abbruch */
  }
  return {
    backupPath: abs,
    originalName: originalNameOf(fileName),
    stamp: parseStamp(fileName, dayTag),
    dayTag,
    kind,
    size,
    originalPath
  }
}

// Einen Tages-Ordner einlesen (flach fuer write/archive; snapshot: top-level
// .snap-Verzeichnisse als EIN read-only Eintrag, kein Tiefen-Walk). Nur stat.
function readDayDir(root: string, dirName: string, kind: ArchiveKind, out: ArchiveBackupEntry[]): void {
  const dayTag = dayTagOf(dirName)
  const dirAbs = join(root, dirName)
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dirAbs, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const abs = join(dirAbs, e.name)
    // Origin-Sidecars sind Metadaten zu einem Backup, KEIN eigenes Backup —
    // nie als Pseudo-Eintrag listen (additiv/defensiv, einzige Listing-Aenderung).
    if (e.name.endsWith('.origin')) continue
    if (kind === 'snapshot') {
      // Ordner-Snapshots: das *.snap-Verzeichnis selbst als read-only Eintrag.
      if (e.isDirectory()) {
        out.push({
          backupPath: abs,
          originalName: originalNameOf(e.name),
          stamp: parseStamp(e.name, dayTag),
          dayTag,
          kind,
          size: 0
        })
      }
      continue
    }
    if (!e.isFile()) continue
    const entry = toEntry(abs, e.name, dayTag, kind)
    if (entry) out.push(entry)
  }
}

/**
 * Alle Backups unter archiveRoot listen (read-only). archive-missing -> Fehler
 * (kein Fallback). Sortiert desc nach stamp (neueste zuerst), auf LIST_LIMIT
 * gekuerzt (truncated). NIE Datei-Inhalt — nur stat.
 */
export function listBackups(archiveRoot: string): IpcResult<ArchiveListResult> {
  try {
    if (!archiveRoot || !existsSync(archiveRoot)) {
      return { data: null, error: 'archive-missing' }
    }
    const out: ArchiveBackupEntry[] = []
    let dayDirs: import('node:fs').Dirent[]
    try {
      dayDirs = readdirSync(archiveRoot, { withFileTypes: true })
    } catch {
      return { data: null, error: 'archive-unreadable' }
    }
    for (const d of dayDirs) {
      if (!d.isDirectory()) continue
      const hit = DAY_KINDS.find((k) => d.name.endsWith(k.suffix))
      if (!hit) continue
      readDayDir(archiveRoot, d.name, hit.kind, out)
    }
    // Neueste zuerst: stamp desc (leerer Stamp ans Ende), dann dayTag desc.
    out.sort((a, b) => (b.stamp || b.dayTag).localeCompare(a.stamp || a.dayTag))
    const truncated = out.length > LIST_LIMIT
    return { data: { entries: out.slice(0, LIST_LIMIT), truncated }, error: null }
  } catch (err) {
    console.error('[archive-restore:list]', err instanceof Error ? err.message : 'list-error')
    return { data: null, error: 'list-failed' }
  }
}

// True, wenn `child` (absolut aufgeloest) WIRKLICH unter `root` liegt (segment-
// sicher, kein startsWith-Trick). Gleichheit zaehlt nicht (includeEqual default
// false). Argument-Reihenfolge: isUnder(child, root) -> isPathWithin(root, child).
function isUnder(child: string, root: string): boolean {
  return isPathWithin(root, child)
}

// Atomarer Write: tmp IM Zielverzeichnis -> fsync -> rename (wie apply-actions).
function atomicWrite(targetPath: string, content: Buffer): void {
  mkdirSync(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}`
  writeFileSync(tmp, content)
  const fd = openSync(tmp, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, targetPath)
}

// Sanitisierter Fehler + Audit-Eintrag (kein Pfad-Stack/Secret nach aussen).
function restoreFail(toPath: string, reason: string, auditPath: string): ArchiveRestoreResult {
  console.error('[archive-restore]', reason)
  appendAudit(makeAuditEntry('restore', toPath, 'error', reason), auditPath)
  return { data: null, error: reason }
}

function rewriteRestoreRefs(req: ArchiveRestoreRequest, ctx: RestoreCtx): string | null {
  if (!req.refsPointTo || req.refsPointTo === req.toPath) return null
  const res = rewriteReferencesForMove(req.refsPointTo, req.toPath, {
    archiveRoot: ctx.archiveRoot,
    auditPath: ctx.auditPath,
    allowedRoots: ctx.allowedRoots
  })
  return res.error
}

function rollbackRestoredTarget(toPath: string, preRestoreSnapshot: string | null, ctx: RestoreCtx): string | null {
  try {
    if (preRestoreSnapshot) {
      atomicWrite(toPath, readFileSync(preRestoreSnapshot))
      return null
    }
    if (!existsSync(toPath)) return null
    const archived = archiveDest(toPath, ctx.archiveRoot)
    if (archived.error || !archived.data) return archived.error ?? 'restore-rollback-failed'
    renameSync(toPath, archived.data)
    appendAudit(makeAuditEntry('archive', toPath, 'ok', 'restore-rollback', archived.data), ctx.auditPath)
    return null
  } catch {
    return 'restore-rollback-failed'
  }
}

/**
 * Eine Backup-Datei auf zielPfad wiederherstellen. Reihenfolge wie apply.ts:
 *  (a) backupPath MUSS unter archiveRoot liegen (kein freier Quellpfad);
 *  (b) assertWritable(zielPfad, ownerEdit) + assertInScope(zielPfad, allowedRoots);
 *  (c) exportSnapshot(zielPfad) backup-first — NUR wenn Ziel existiert (HR7);
 *  (d) Backup-Inhalt lesen + atomar tmp+rename auf zielPfad;
 *  (e) appendAudit('restore', ...). NIE Loeschung, immer Pre-Snapshot vor Overwrite.
 * Snapshot-Ordner (.snap) sind NICHT wiederherstellbar (read-only).
 */
export function restoreBackup(req: ArchiveRestoreRequest, ctx: RestoreCtx): ArchiveRestoreResult {
  const { archiveRoot, auditPath, allowedRoots } = ctx
  if (!req || !req.backupPath || !req.toPath) {
    return restoreFail(req?.toPath ?? '', 'invalid-request', auditPath)
  }
  const { backupPath, toPath } = req

  // (a) Quelle MUSS unter archiveRoot liegen (kein freier Quellpfad).
  if (!isUnder(backupPath, archiveRoot)) {
    return restoreFail(toPath, 'backup-out-of-archive', auditPath)
  }
  // Ordner-Snapshots (.snap) sind v1 read-only — nie als Einzeldatei restaurierbar.
  if (/\.snap$/i.test(backupPath)) {
    return restoreFail(toPath, 'snapshot-not-restorable', auditPath)
  }
  if (!existsSync(backupPath) || !statSync(backupPath).isFile()) {
    return restoreFail(toPath, 'backup-not-found', auditPath)
  }

  // (b) Ziel-Guard: Secret-/Owner-Edit-Klasse (Owner-Override) + harter Scope.
  const guard = assertWritable(toPath, { ownerEdit: true })
  if (!guard.writable) return restoreFail(toPath, guard.reason ?? 'owner-only/not-in-scope', auditPath)
  const scope = assertInScope(toPath, allowedRoots)
  if (!scope.writable) return restoreFail(toPath, scope.reason ?? 'out-of-scope', auditPath)

  // (c) backup-first: Pre-Restore-Snapshot der aktuellen Zieldatei (HR7) — nur
  //     wenn das Ziel existiert. Fehlt der Archiv-Root -> harter Abbruch VOR Mutation.
  let preRestoreSnapshot: string | null = null
  if (existsSync(toPath)) {
    const snap = exportSnapshot(toPath, archiveRoot)
    if (snap.error) return restoreFail(toPath, snap.error, auditPath) // archive-missing etc.
    preRestoreSnapshot = snap.data?.snapshotPath || null
  }

  // (d) Inhalt lesen + atomar schreiben (tmp+rename im Zielverzeichnis).
  try {
    const content = readFileSync(backupPath)
    atomicWrite(toPath, content)
  } catch (err) {
    return restoreFail(toPath, err instanceof Error ? 'restore-write-failed' : 'restore-failed', auditPath)
  }

  const rewriteError = rewriteRestoreRefs(req, ctx)
  if (rewriteError) {
    const rollbackError = rollbackRestoredTarget(toPath, preRestoreSnapshot, ctx)
    return restoreFail(toPath, rollbackError ? `${rewriteError}: ${rollbackError}` : rewriteError, auditPath)
  }

  // (e) Audit NACH erfolgreichem rename (Backup-Basename als Herkunft).
  appendAudit(makeAuditEntry('restore', toPath, 'ok', undefined, basename(backupPath)), auditPath)
  return { data: { restoredTo: toPath, preRestoreSnapshot }, error: null }
}
