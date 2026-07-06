// apply.ts — ECHTER Schreib-Dispatch hinter PersistencePort. Strukturelle
// Reihenfolge: guard -> backup(Pre-Snapshot) -> mutate(tmp+rename) -> audit.
// backup-Fehler bricht VOR jeder Mutation ab (kein Mutate bei archive-missing).
// Atomaritaet/Aktionslogik in apply-actions.ts; Secret-Schutz via secret-guard.
// Dir-Dispatch: checkPath(secret+assertInScope Quell+Ziel) -> snapshotDir
//   (leeres/fehlendes Ergebnis = harter Abbruch VOR Mutation) -> Mutation -> Audit.
// KEINE Guard-/Snapshot-Duplikation in apply-dir-actions.ts (reine FS-Mechanik).
// KEIN throw nach aussen -> WriteResult / DirActionResult.
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type {
  WriteRequest,
  WriteResult,
  WriteResultData,
  DirActionRequest,
  DirActionResult,
  DirActionResultData
} from '@shared/contract-write'
import { assertWritable, isSecretPathForRead } from './secret-guard'
import { maskSecrets } from './secret-mask'
import { assertInScope } from './path-scope'
import { backup as backupAdapter, DEFAULT_ARCHIVE_ROOT, snapshotDir, archiveDest, archiveDestDir } from './backup'
import { runAction, needsBackup, type ActionOptions } from './apply-actions'
import { appendAudit, makeAuditEntry, DEFAULT_AUDIT_PATH } from './audit-log'
import { archiveDir, moveDir, dirCheckSecretTree } from './apply-dir-actions'
import { rewriteReferencesForMove } from './integrity/reference-rewrite'
import { buildPairs, collectAllFiles, isSecretFile, isTextCandidate, readTextFile, safeStat } from './integrity/reference-pairs'

// Vertrag fuer den Schreib-Adapter (stabil; Phase 2 echte Implementierung).
export interface PersistencePort {
  apply(req: WriteRequest, opts?: Partial<ApplyOptions>): WriteResult
}

// Injizierbare Pfade (Default real; Test = temp). `allowedRoots` kommt aus dem
// write-context (P0-2): nur Pfade darunter sind mutierbar. undefined =
// Scope-Check uebersprungen (Direkt-/Test-Aufruf); IPC reicht IMMER Roots durch.
export interface ApplyOptions {
  archiveRoot: string
  auditPath: string
  allowedRoots?: string[]
  // W3: wenn true, ueberspringt applyWrite nach erfolgreichem move den internen
  // rewriteReferencesForMove-Aufruf (FS-Move + Audit bleiben). Genutzt von der
  // Integrity-Transaktionsschicht (apply-integrity), die den Referenz-Rewrite
  // selbst orchestriert (eigene Phase + Journal-Rollback). Default false =
  // Verhalten unveraendert (W0-Direktroute zieht Referenzen weiter mit).
  skipRefRewrite?: boolean
}

const DEFAULTS: ApplyOptions = {
  archiveRoot: DEFAULT_ARCHIVE_ROOT,
  auditPath: DEFAULT_AUDIT_PATH
}

// Sanitisierter Fehler ohne Pfad-Stack/Secret.
function fail(req: WriteRequest, reason: string, opts: ApplyOptions): WriteResult {
  console.error('[apply]', `${req.action}: ${reason}`)
  appendAudit(makeAuditEntry(req.action, req.path, 'error', reason), opts.auditPath)
  return { data: null, error: reason }
}

// Secret- UND Scope-Guard fuer EINEN Zielpfad (P0-2). allowedRoots leer/undef ->
// Scope-Check uebersprungen (Direkt-/Test-Aufruf). Gibt reason zurueck, null=ok.
// `ownerEdit` (Owner-Override) wird NUR fuer den owner-initiierten Einzeldatei-
// Edit auf req.path durchgereicht; NIE fuer req.to/archive/Dir-Actions. Der
// assertInScope-Scope-Check bleibt IMMER hart — ownerEdit hebelt NUR den
// Secret-Klassen-Zweig in assertWritable aus, nicht die Wurzel-Allowlist.
function checkPath(p: string, allowedRoots?: string[], ownerEdit?: boolean): string | null {
  const guard = assertWritable(p, { ownerEdit: ownerEdit === true })
  if (!guard.writable) return guard.reason ?? 'owner-only/not-in-scope'
  if (allowedRoots && allowedRoots.length > 0) {
    const scope = assertInScope(p, allowedRoots)
    if (!scope.writable) return scope.reason ?? 'out-of-scope'
  }
  return null
}

// CRLF->LF normalisieren: maskSecrets arbeitet zeilenbasiert mit '\n'-Join und
// kann dabei '\r' verlieren — beide Seiten vor dem Vergleich angleichen (WP21).
function toLf(s: string): string {
  return s.replace(/\r\n/g, '\n')
}

// No-Data-Loss-Zweitlinie (TEST-MITTEL-02/A10): lehnt einen edit ab, dessen
// Inhalt EXAKT der maskierten Fassung des aktuellen Disk-Inhalts entspricht —
// sonst wuerde bei versagendem Renderer-Guard (OverviewEditor) maskierter
// Anzeige-Inhalt (•••) echte Secret-Werte auf Disk ueberschreiben. KEIN
// •••-Substring-/Sentinel-Scan (Owner-Override [[app-zeigt-secrets-lokal-
// owner-override]]): nur Gesamtvergleich gegen maskSecrets(Disk), NUR auf
// Secret-WERT-Pfaden (isSecretPathForRead). Eine .md mit •••-Zeichen bleibt
// speicherbar. Gibt reason zurueck, null = ok.
function rejectsMaskedOverwrite(req: WriteRequest): string | null {
  if (req.action !== 'edit' || typeof req.content !== 'string') return null
  if (!isSecretPathForRead(req.path)) return null
  try {
    const disk = readFileSync(req.path, 'utf8')
    const { masked, maskedCount } = maskSecrets(disk, req.path)
    if (maskedCount > 0 && (req.content === masked || toLf(req.content) === toLf(masked))) {
      return 'masked-content-no-data-loss'
    }
  } catch {
    // Disk nicht lesbar (fehlend/Race/Berechtigung): Zweitlinie still passieren
    // lassen — sie darf den Edit-Pfad nie haerter machen als heute.
  }
  return null
}

function archiveInboundRefs(path: string, allowedRoots?: string[]): { inboundRefCount: number; inboundRefs: string[] } | null {
  const roots = (allowedRoots ?? []).filter(Boolean)
  if (roots.length === 0) return null
  const files: string[] = []
  for (const root of roots) collectAllFiles(root, files)
  const source = resolve(path).toLowerCase()
  const pairs = buildPairs(path, `${path}-archive-warning.md`)
  const refs: string[] = []
  let count = 0
  for (const filePath of files) {
    if (resolve(filePath).toLowerCase() === source) continue
    const st = safeStat(filePath)
    if (!st?.isFile() || isSecretFile(filePath) || !isTextCandidate(filePath)) continue
    const read = readTextFile(filePath)
    if (!read || read.binary || read.oversize) continue
    const hit = pairs.some((pair) => read.content.includes(pair.needle))
    if (!hit) continue
    count++
    if (refs.length < 20) refs.push(basename(filePath))
  }
  return count > 0 ? { inboundRefCount: count, inboundRefs: refs } : null
}

function validateWriteRequest(req: WriteRequest, opts: ApplyOptions): WriteResult | null {
  const ownerEditPath = (req.action === 'edit' || req.action === 'add') && req.ownerEdit === true
  const badPath = checkPath(req.path, opts.allowedRoots, ownerEditPath)
  if (badPath) return fail(req, badPath, opts)
  if (req.to && req.ownerMove !== true) {
    const badTo = checkPath(req.to, opts.allowedRoots) // req.to NIE ownerEdit
    if (badTo) return fail(req, badTo, opts)
  }
  const maskedReason = rejectsMaskedOverwrite(req)
  if (maskedReason) return fail(req, maskedReason, opts)
  return null
}

function applyInbound(data: WriteResultData, inbound: ReturnType<typeof archiveInboundRefs>): void {
  if (!inbound) return
  data.inboundRefCount = inbound.inboundRefCount
  data.inboundRefs = inbound.inboundRefs
}

function mutateWrite(
  req: WriteRequest,
  opts: ApplyOptions,
  backupPath: string | null,
  inbound: ReturnType<typeof archiveInboundRefs>
): WriteResult {
  try {
    const data = runAction(req, { archiveRoot: opts.archiveRoot })
    data.backupPath = backupPath
    applyInbound(data, inbound)
    if (req.action === 'move' && data.movedTo && opts.skipRefRewrite !== true) {
      const refs = rewriteReferencesForMove(req.path, data.movedTo, opts)
      if (refs.error) return fail(req, refs.error, opts)
    }
    appendAudit(makeAuditEntry(req.action, req.path, 'ok', undefined, data.movedTo), opts.auditPath)
    return { data, error: null }
  } catch (err) {
    return fail(req, err instanceof Error ? err.message : 'apply-failed', opts)
  }
}

// Dispatch einer einzelnen Mutation. guard-first, dann backup-first.
function applyRequest(req: WriteRequest, partial?: Partial<ApplyOptions>): WriteResult {
  const opts: ApplyOptions = { ...DEFAULTS, ...partial }
  const invalid = validateWriteRequest(req, opts)
  if (invalid) return invalid
  const inbound = req.action === 'archive' ? archiveInboundRefs(req.path, opts.allowedRoots) : null
  let backupPath: string | null = null
  if (needsBackup(req)) {
    const snap = backupAdapter.backup(req.path, opts.archiveRoot)
    if (snap.error) return fail(req, snap.error, opts) // archive-missing -> Abbruch VOR Mutation
    backupPath = snap.data?.snapshotPath || null
  }
  return mutateWrite(req, opts, backupPath, inbound)
}

// Adapter-Instanz (PersistencePort).
export const apply: PersistencePort = {
  apply(req: WriteRequest, opts?: Partial<ApplyOptions>): WriteResult {
    return applyRequest(req, opts)
  }
}

// Direkter Export fuer IPC/Tests (ohne Port-Indirektion).
export function applyWrite(req: WriteRequest, opts?: Partial<ApplyOptions>): WriteResult {
  return applyRequest(req, opts)
}

// ── Dir-Dispatch (HR7-Reihenfolge) ──────────────────────────────────────────
// Verbindliche Reihenfolge: checkPath(secret+Scope Quell+Ziel) ->
//   snapshotDir(leer/fehlend = harter Abbruch VOR Mutation) -> Mutation -> Audit.
// apply-dir-actions.ts bleibt reine FS-Mechanik (keine Guard-/Snapshot-Dup).

function dirFail(req: DirActionRequest, reason: string, opts: ApplyOptions): DirActionResult {
  console.error('[apply:dir]', `${req.action}: ${reason}`)
  appendAudit(makeAuditEntry(req.action, req.path, 'error', reason), opts.auditPath)
  return { data: null, error: reason }
}

function validateDirRequest(req: DirActionRequest, opts: ApplyOptions): DirActionResult | null {
  if (!req || !req.path) return dirFail(req ?? { action: 'archive-dir', path: '' }, 'invalid-request', opts)
  const secretErr = dirCheckSecretTree(req.path)
  if (secretErr) return dirFail(req, secretErr, opts)
  const badSrc = checkPath(req.path, opts.allowedRoots)
  if (badSrc) return dirFail(req, badSrc, opts)
  if (req.action === 'move-dir') {
    if (!req.to) return dirFail(req, 'move-dir: to-path fehlt', opts)
    if (req.ownerMove !== true) {
      const badDest = checkPath(req.to, opts.allowedRoots)
      if (badDest) return dirFail(req, badDest, opts)
    }
  }
  return null
}

function mutateDir(req: DirActionRequest, opts: ApplyOptions): { movedTo: string | null; error: string | null } {
  if (req.action === 'archive-dir') {
    const destResult = archiveDestDir(req.path, opts.archiveRoot)
    if (destResult.error || !destResult.data) return { movedTo: null, error: destResult.error ?? 'archive-dest-failed' }
    const err = archiveDir(req.path, destResult.data)
    if (err && (err as string).startsWith('error:')) return { movedTo: null, error: err as string }
    return { movedTo: destResult.data, error: null }
  }
  const err = moveDir(req.path, req.to!)
  if (err) return { movedTo: null, error: err }
  if (opts.skipRefRewrite !== true) {
    const refs = rewriteReferencesForMove(req.path, req.to!, opts)
    if (refs.error) return { movedTo: null, error: refs.error }
  }
  return { movedTo: req.to!, error: null }
}

function dirData(
  req: DirActionRequest,
  movedTo: string | null,
  snapshotPath: string,
  inbound: ReturnType<typeof archiveInboundRefs>
): DirActionResultData {
  return { action: req.action, path: req.path, movedTo, snapshotPath, ...inbound }
}

export function applyDirAction(req: DirActionRequest, partial?: Partial<ApplyOptions>): DirActionResult {
  const opts: ApplyOptions = { ...DEFAULTS, ...partial }
  const invalid = validateDirRequest(req, opts)
  if (invalid) return invalid
  const inbound = req.action === 'archive-dir' ? archiveInboundRefs(req.path, opts.allowedRoots) : null
  const snap = snapshotDir(req.path, opts.archiveRoot)
  if (snap.error || !snap.data?.snapshotPath) return dirFail(req, snap.error ?? 'snapshot-empty', opts)
  const moved = mutateDir(req, opts)
  if (moved.error) return dirFail(req, moved.error, opts)
  appendAudit(makeAuditEntry(req.action, req.path, 'ok', undefined, moved.movedTo ?? undefined), opts.auditPath)
  return { data: dirData(req, moved.movedTo, snap.data.snapshotPath, inbound), error: null }
}
