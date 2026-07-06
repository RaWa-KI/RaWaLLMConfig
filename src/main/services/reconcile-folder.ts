// reconcile-folder.ts — SYMMETRISCHER Ordner-Merge 2->1 mit Pro-Datei-Entscheidung
// (kein Auto-Merge). Owner-Entscheidung per decisions-Map (rel -> keep-trunk |
// keep-mirror | adopt-mirror | adopt-trunk | skip). Finding B: pro Datei kann
// WAHLWEISE die Trunk- ODER die Mirror-Seite ueberleben; die andere wird
// archiviert (HR7). Pro-Datei-Executoren liegen in reconcile-folder-ops.ts.
// Strukturelle Garantien:
//   - keep-trunk/keep-mirror: Gewinner bleibt, Verlierer-Datei pro Datei archiviert.
//   - adopt-mirror/adopt-trunk: Quell-Inhalt -> Gegenseite (edit/add, backup-first),
//                               danach Quell-Seite archiviert.
//   - skip: Datei wird nicht beruehrt.
//   - secret-bearing Dateien -> 'secret-skip' (niemals mutiert/archiviert), symmetrisch.
//   - Partial-Failure: Abbruch nach Datei k -> Teilreport, keine weitere Mutation.
//   - Sonderfall ALLE keep-trunk: Mirror-ORDNER als Ganzes archiviert (Bulk-No-op).
//   - Re-Run idempotent: eine Seite fehlt + andere existiert -> 'already-reconciled'.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ALREADY_RECONCILED,
  type DirReconcileRequest,
  type DirReconcileResult,
  type DirReconcileResultData,
  type DirFileReconcileEntry,
  type DirFileDecision
} from '@shared/contract-write'
import type { DirFileEntry } from '@shared/contract'
import { isManifestPath, manifestParent } from '@shared/manifest-map'
import { type ApplyOptions } from './apply'
import { archiveDir, dirCheckSecretTree } from './apply-dir-actions'
import { archiveDestDir, DEFAULT_ARCHIVE_ROOT } from './backup'
import { compareDirs } from './dir-compare'
import { runFileDecision } from './reconcile-folder-ops'
import { rewriteReferencesForMove } from './integrity/reference-rewrite'

// Injizierbare Optionen (Test = temp).
export interface ReconcileFolderOptions {
  archiveRoot?: string
  auditPath?: string
  allowedRoots?: string[]
}

function fail(reason: string): DirReconcileResult {
  console.error('[reconcile-folder]', reason)
  return { data: null, error: reason }
}

// F7-Idempotenz-Sentinel: kanonische EINE Quelle ist @shared/contract-write
// (WP-10). Hier nur re-exportiert, damit bestehende Konsumenten den Import-Pfad
// reconcile-folder.ts behalten — KEIN zweites Literal mehr.
export { ALREADY_RECONCILED }

// Deterministisches No-op-Result: EINE Seite fehlt (bereits archiviert), die
// andere steht (symmetrisch, Finding B). Kein Datei-Touch, keine zweite
// Archivierung — strukturelle „nur EINMAL"-Garantie.
function alreadyReconciled(): DirReconcileResult {
  return { data: null, error: ALREADY_RECONCILED }
}

// Manifestdatei eines Item-Ordners (Skills/Agents/Teams/Plugins) -> der
// enthaltende Ordner. Scanner-Asymmetrie (shared-scan setzt entry.path auf die
// Manifestdatei = .../SKILL.md bzw. teams/config.json; dedupe.storeSet uebernimmt
// das unveraendert) kann dem Request einen DATEI-Pfad statt des Ordnerpfads
// liefern. compareDirs braucht aber ein Verzeichnis, sonst scheitert der
// Reconcile mit 'dir-compare-failed'. Hier wird MAIN-seitig (Defense-in-Depth,
// unabhaengig vom Renderer) auf den Ordner normalisiert — Manifest-Erkennung +
// dirname-String kommen ZENTRAL aus @shared/manifest-map (kontext-bewusst).
// Nicht-Manifest-Pfade und echte Ordnerpfade bleiben unveraendert;
// assertInScope/Secret-Gates laufen danach auf dem normalisierten Pfad.

function isDirSafe(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch {
    return false
  }
}

function normalizeToFolder(rawPath: string): string {
  // Manifestdatei (SKILL.md/AGENT.md/teams-config.json/plugins-plugin.json) UND
  // Parent ist ein Ordner -> auf den enthaltenden Ordner normalisieren.
  if (isManifestPath(rawPath)) {
    const parent = manifestParent(rawPath)
    if (isDirSafe(parent)) return parent
  }
  return rawPath
}

/**
 * Fuehrt den Ordner-Merge gemaess DirReconcileRequest aus.
 * Mirror wird nur archiviert, wenn ALLE decisions terminal und
 * keine adopt-Datei offen ist (Partial-Failure-Schutz).
 */
export function reconcileFolder(
  rawReq: DirReconcileRequest,
  opts: ReconcileFolderOptions = {}
): DirReconcileResult {
  // Basisvalidierung
  if (!rawReq || !rawReq.trunkPath || !rawReq.mirrorPath) return fail('invalid-request')
  // Manifest-Pfade robust auf den Ordner normalisieren (MAIN-seitige Defense-in-
  // Depth gegen DATEI-statt-Ordner-Pfade aus shared-scan/dedupe). decisions/Rest
  // bleiben unveraendert; Secret-/Scope-Gates greifen danach auf den Ordnerpfaden.
  const req: DirReconcileRequest = {
    ...rawReq,
    trunkPath: normalizeToFolder(rawReq.trunkPath),
    mirrorPath: normalizeToFolder(rawReq.mirrorPath)
  }
  // F7-Idempotenz (Finding B: symmetrisch). Fehlt EINE Seite, die andere existiert
  // noch -> die Bulk-Aktion war schon erfolgreich -> DETERMINISTISCH
  // 'already-reconciled' (kein generisches 'path-not-found', keine zweite Aktion).
  // Gilt fuer beide Richtungen (Mirror-Bulk-Archiv ODER Trunk-Bulk-Archiv). Erst
  // wenn BEIDE Pfade fehlen ist es ein echter path-not-found.
  const trunkOk = existsSync(req.trunkPath)
  const mirrorOk = existsSync(req.mirrorPath)
  if (!trunkOk || !mirrorOk) {
    if (trunkOk || mirrorOk) return alreadyReconciled()
    return fail('path-not-found')
  }

  const archiveRoot = opts.archiveRoot ?? DEFAULT_ARCHIVE_ROOT
  const applyOpts: Partial<ApplyOptions> = {
    archiveRoot,
    auditPath: opts.auditPath,
    allowedRoots: opts.allowedRoots
  }

  // Verzeichnis-Diff (Dateiliste aus beiden Seiten)
  const diff = compareDirs(req.trunkPath, req.mirrorPath)
  if (!diff) return fail('dir-compare-failed')

  // Bulk-Erkennung (F7-Idempotenz-Erhalt): wenn ALLE aktionablen Dateien dieselbe
  // VERLIERER-Seite opfern (Mirror bei keep-trunk/adopt-mirror; Trunk bei
  // keep-mirror/adopt-trunk), wird die Verlierer-Seite als GANZER ORDNER archiviert
  // statt Datei fuer Datei. So verschwindet der Verlierer-Ordner -> ein Re-Run sieht
  // „eine Seite fehlt" und liefert deterministisch already-reconciled. Bei gemischten
  // Entscheidungen bleibt jede Seite mit ihrem Gewinner stehen (kein Bulk).
  // HR24: enthaelt die Verlierer-Seite eine secret-Datei, KEIN Bulk-Ordner-Move
  // (sonst wuerde ein Secret mitwandern) -> per-Datei (secret-skip greift dort).
  let bulkLoser = bulkLoserSide(diff.files, req.decisions)
  if (bulkLoser) {
    const loserDir = bulkLoser === 'mirror' ? req.mirrorPath : req.trunkPath
    if (dirCheckSecretTree(loserDir)) bulkLoser = null
  }

  // Pro-Datei-Entscheidungen ausfuehren (HR27-Split: processDecisions). Im Bulk-Fall
  // archiviert processDecisions die Verlierer-Datei NICHT pro Datei (skipArchive).
  const { results, aborted } = processDecisions(diff.files, req, applyOpts, bulkLoser)

  // Bulk-Ordner-Archiv der Verlierer-Seite nur ohne Abbruch.
  let mirrorArchivedTo: string | null = null
  if (bulkLoser && !aborted) {
    const loserDir = bulkLoser === 'mirror' ? req.mirrorPath : req.trunkPath
    mirrorArchivedTo = archiveLoserDir(loserDir, archiveRoot)
  }

  const resultData: DirReconcileResultData = {
    trunkPath: req.trunkPath,
    mirrorArchivedTo,
    files: results,
    partial: aborted
  }
  return { data: resultData, error: null }
}

// Welche Seite opfern ALLE aktionablen Dateien? 'mirror' (keep-trunk/adopt-mirror),
// 'trunk' (keep-mirror/adopt-trunk) oder null bei gemischten/keinen Entscheidungen.
// Secret-/skip-Dateien zaehlen nicht (werden nie als Bulk-Ordner archiviert).
function bulkLoserSide(
  files: DirFileEntry[],
  decisions: Record<string, DirFileDecision>
): 'trunk' | 'mirror' | null {
  let side: 'trunk' | 'mirror' | null = null
  for (const f of files) {
    if (f.secret) continue
    const dec = decisions[f.rel] ?? 'skip'
    if (dec === 'skip') continue
    const loser = dec === 'keep-trunk' || dec === 'adopt-mirror' ? 'mirror' : 'trunk'
    if (side === null) side = loser
    else if (side !== loser) return null // gemischte Verlierer-Seiten -> kein Bulk
  }
  return side
}

// Pro-Datei-Entscheidungen abarbeiten (HR27-Split aus reconcileFolder). Bricht bei
// erstem Datei-Error ab (Partial-Failure-Schutz). bulkLoser!=null -> die Verlierer-
// Datei wird NICHT pro Datei archiviert (Bulk-Ordner-Archiv folgt am Ende).
function processDecisions(
  files: DirFileEntry[],
  req: DirReconcileRequest,
  applyOpts: Partial<ApplyOptions>,
  bulkLoser: 'trunk' | 'mirror' | null
): { results: DirFileReconcileEntry[]; aborted: boolean } {
  const results: DirFileReconcileEntry[] = []
  for (const entry of files) {
    const rel = entry.rel
    const decision = req.decisions[rel] ?? 'skip'
    if (decision === 'skip') { results.push({ rel, decision: 'skip' }); continue }
    if (entry.secret) { results.push({ rel, decision: 'secret-skip' }); continue }
    if (!isKnownDecision(decision)) {
      results.push({ rel, decision: 'error', error: 'invalid-decision' })
      return { results, aborted: true }
    }
    const refErr = rewriteEntryRefs(entry, decision, req.trunkPath, req.mirrorPath, applyOpts)
    if (refErr) {
      results.push({ rel, decision: 'error', error: refErr })
      return { results, aborted: true }
    }
    const fileResult = runFileDecision(
      entry, decision, req.trunkPath, req.mirrorPath, applyOpts, bulkLoser !== null
    )
    results.push(fileResult)
    if (fileResult.decision === 'error') return { results, aborted: true }
  }
  return { results, aborted: false }
}

// Gueltige aktionable Entscheidung (alles ausser skip — skip wird vorher behandelt).
function isKnownDecision(
  d: DirFileDecision
): d is 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk' {
  return d === 'keep-trunk' || d === 'keep-mirror' || d === 'adopt-mirror' || d === 'adopt-trunk'
}

function refMoveForDecision(
  entry: DirFileEntry,
  decision: 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk',
  trunkDir: string,
  mirrorDir: string
): { loser?: string; survivor: string } {
  switch (decision) {
    case 'keep-trunk':
      return { loser: entry.mirrorPath, survivor: entry.trunkPath ?? join(trunkDir, entry.rel) }
    case 'keep-mirror':
      return { loser: entry.trunkPath, survivor: entry.mirrorPath ?? join(mirrorDir, entry.rel) }
    case 'adopt-mirror':
      return { loser: entry.mirrorPath, survivor: join(trunkDir, entry.rel) }
    case 'adopt-trunk':
      return { loser: entry.trunkPath, survivor: join(mirrorDir, entry.rel) }
  }
}

function rewriteEntryRefs(
  entry: DirFileEntry,
  decision: 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk',
  trunkDir: string,
  mirrorDir: string,
  opts: Partial<ApplyOptions>
): string | null {
  if (!opts.archiveRoot || !opts.auditPath) return null
  const move = refMoveForDecision(entry, decision, trunkDir, mirrorDir)
  if (!move.loser) return null
  const refs = rewriteReferencesForMove(move.loser, move.survivor, {
    archiveRoot: opts.archiveRoot,
    auditPath: opts.auditPath,
    allowedRoots: opts.allowedRoots
  })
  return refs.error
}

// Verlierer-Verzeichnis (Trunk- ODER Mirror-Seite) in den Archiv-Root verschieben
// (HR7, kein Loeschen). loserDir ist ein VERZEICHNIS -> archiveDestDir (kein 0-Byte-
// Platzhalter wie archiveDest fuer Dateien; sonst scheitert der cross-volume copyDir
// an der Platzhalterdatei). Konsistent mit applyDirAction (P1-Klasse, WP-DIR-07).
// null = Archivierung fehlgeschlagen (Verlierer-Ordner bleibt stehen).
function archiveLoserDir(loserDir: string, archiveRoot: string): string | null {
  const destRes = archiveDestDir(loserDir, archiveRoot)
  if (destRes.error || !destRes.data) return null
  const archErr = archiveDir(loserDir, destRes.data)
  if (archErr && (archErr as string).startsWith('error:')) return null
  return destRes.data
}
