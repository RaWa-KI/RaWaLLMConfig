// rename-move.ts — Umbenennen-/Verschieben-Routen (WP-03). KEINE eigene Guard-/
// Backup-/Snapshot-Mechanik: rename + moveVersioned bilden intern auf den
// bestehenden apply-Dispatch ab (applyWrite('move') fuer Dateien, applyDirAction
// ('move-dir') fuer Ordner). Damit laufen Secret-Gate (Quell- UND Ziel-Basename),
// assertInScope (Quell- UND Ziel-Pfad), backup-first je Seite und Audit
// unveraendert ueber apply.ts (F4: kein parallel dupliziertes Guard-Code).
// Seitenwahl nutzt ECHTE Pfade je Seite (RenameSidePath.path), nie DuplicateSet.name.
// Partial-Report analog DirReconcileResult. KEIN throw nach aussen — IpcResult.
import { existsSync, statSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import type {
  RenameRequest,
  RenameResult,
  RenameResultData,
  RenameSideResult,
  RenameSidePath,
  MoveVersionedRequest,
  MoveVersionedResult,
  MoveVersionedResultData
} from '@shared/contract-write-rename'
import { applyWrite, applyDirAction, type ApplyOptions } from './apply'

// Sanitisierter Ablehnungs-Text (sichtbar im UI, kein Secret/Pfad-Leak).
const BAD_NAME_MSG = 'Neuer Name darf keinen Pfad enthalten und nicht leer sein.'

// Quell-Reason von apply auf einen Seiten-Status mappen (kein neuer Guard-Code).
// apply liefert 'owner-only/not-in-scope' (Secret) bzw. 'out-of-scope' (Scope).
function statusFromReason(reason: string): RenameSideResult['status'] {
  if (reason === 'owner-only/not-in-scope') return 'secret-skip'
  if (reason === 'out-of-scope') return 'out-of-scope'
  return 'error'
}

// Ist `p` ein existierendes Verzeichnis? (Datei vs. Ordner -> move vs. move-dir.)
function isDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

// `newName` als reiner Basisname pruefen (kein Pfad-Segment, nicht leer).
function isPlainName(name: string): boolean {
  return !!name && !name.includes('/') && !name.includes('\\') && name.trim().length > 0
}

// Eine Seite umbenennen: Ziel = gleiches Verzeichnis + newName. Dispatch je nach
// Datei/Ordner an den bestehenden apply-Move (Secret/Scope/Backup laeuft dort).
function renameOneSide(
  sp: RenameSidePath,
  newName: string,
  ctx: Partial<ApplyOptions>
): RenameSideResult {
  const fromPath = sp.path
  const toPath = join(dirname(fromPath), newName)
  if (basename(fromPath) === newName) {
    return { side: sp.side, status: 'renamed', fromPath, toPath, backupPath: null }
  }
  if (isDir(fromPath)) {
    const res = applyDirAction({ action: 'move-dir', path: fromPath, to: toPath }, ctx)
    if (res.error || !res.data) {
      return { side: sp.side, status: statusFromReason(res.error ?? ''), fromPath, toPath: null, error: res.error ?? 'rename-failed' }
    }
    return { side: sp.side, status: 'renamed', fromPath, toPath, backupPath: res.data.snapshotPath }
  }
  const res = applyWrite({ action: 'move', path: fromPath, to: toPath }, ctx)
  if (res.error || !res.data) {
    return { side: sp.side, status: statusFromReason(res.error ?? ''), fromPath, toPath: null, error: res.error ?? 'rename-failed' }
  }
  return { side: sp.side, status: 'renamed', fromPath, toPath, backupPath: res.data.backupPath }
}

// Gewaehlte Seiten je nach `sides` aufloesen (ECHTE Pfade aus dem Request).
function selectedSides(req: RenameRequest): RenameSidePath[] {
  const out: RenameSidePath[] = []
  if ((req.sides === 'beide' || req.sides === 'shared') && req.shared) out.push(req.shared)
  if ((req.sides === 'beide' || req.sides === 'claude') && req.claude) out.push(req.claude)
  return out
}

/**
 * Umbenennen (Datei ODER Ordner) mit Seitenwahl. Jede Seite laeuft backup-first
 * ueber den apply-Dispatch (Secret/Scope-Gate dort). Partial-Report: true wenn
 * eine gewaehlte Seite nicht umbenannt wurde. KEIN throw.
 */
export function renameEntry(
  req: RenameRequest,
  ctx: Partial<ApplyOptions> = {}
): RenameResult {
  if (!req || !req.sides || typeof req.newName !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  if (!isPlainName(req.newName)) return { data: null, error: BAD_NAME_MSG }
  const sides = selectedSides(req)
  if (sides.length === 0) return { data: null, error: 'invalid-request' }

  const results: RenameSideResult[] = sides.map((sp) => renameOneSide(sp, req.newName, ctx))
  const partial = results.some((r) => r.status !== 'renamed')
  const data: RenameResultData = { newName: req.newName, sides: results, partial }
  return { data, error: null }
}

/**
 * Verschieben einer gewaehlten Version (shared|claude) an einen freien Ziel-Pfad.
 * Finding A: jeder Versions-Move ist owner-initiiert -> ownerMove=true. Das frei
 * gewaehlte ZIEL wird NICHT mehr gegen die Wurzel-Allowlist geprueft (Owner darf
 * an JEDES absolute Ziel verschieben/archivieren, inkl. E:). Der QUELL-Pfad
 * bleibt secret-/scope-gescopet, backup-first laeuft im apply-Dispatch vor Move.
 */
export function moveEntryVersioned(
  req: MoveVersionedRequest,
  ctx: Partial<ApplyOptions> = {}
): MoveVersionedResult {
  if (!req || !req.version || typeof req.fromPath !== 'string' || typeof req.to !== 'string') {
    return { data: null, error: 'invalid-request' }
  }
  const dir = isDir(req.fromPath)
  if (dir) {
    const res = applyDirAction(
      { action: 'move-dir', path: req.fromPath, to: req.to, ownerMove: true },
      ctx
    )
    if (res.error || !res.data) return { data: null, error: res.error ?? 'move-failed' }
    const data: MoveVersionedResultData = {
      version: req.version, fromPath: req.fromPath, movedTo: res.data.movedTo,
      backupPath: res.data.snapshotPath, isDir: true
    }
    return { data, error: null }
  }
  const res = applyWrite({ action: 'move', path: req.fromPath, to: req.to, ownerMove: true }, ctx)
  if (res.error || !res.data) return { data: null, error: res.error ?? 'move-failed' }
  const data: MoveVersionedResultData = {
    version: req.version, fromPath: req.fromPath, movedTo: res.data.movedTo ?? null,
    backupPath: res.data.backupPath, isDir: false
  }
  return { data, error: null }
}
