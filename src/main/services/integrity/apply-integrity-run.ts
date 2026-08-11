// apply-integrity-run.ts — Phasen-Orchestrierung der Integritäts-Transaktion (W3).
// Reihenfolge: snapshot -> fs -> beforeReferences -> reference -> afterReferences
// -> verify. Bei Fehler in fs/reference/verify (inkl. geworfener Hook) Rollback
// über das Journal. NIE applied:true nach Fehler, NIE partial:true.
import { existsSync } from 'node:fs'
import type {
  IntegrityApplyData,
  IntegrityApplyPhase,
  IntegrityApplyResult,
  IntegrityFsOp,
  IntegrityPlan,
  RollbackStatus
} from '@shared/contract-integrity'
import { applyWrite, applyDirAction } from '../apply'
import { reconcile } from '../reconcile'
import { applyReferenceOps } from './reference-apply'
import { runVerifyPhase } from './verify-references'
import { createJournal, type IntegrityJournal } from './journal'

export interface RunOptions {
  archiveRoot: string
  auditPath: string
  allowedRoots?: string[]
  /**
   * Reine Anzeige-Meldung an die UI (Fortschrittsbalken beim Speichern). Darf
   * die Transaktion NIE beeinflussen — Fehler im Callback werden geschluckt.
   */
  onProgress?: (p: {
    operationId: string
    phase: IntegrityApplyPhase
    done: number
    total: number
  }) => void
  hooks?: {
    beforeReferences?: () => void | Promise<void>
    afterReferences?: () => void | Promise<void>
  }
}

/** Fortschritts-Melder, der nie wirft (Anzeige ist nie transaktionsrelevant). */
type Report = (phase: IntegrityApplyPhase, done: number, total: number) => void

function makeReporter(plan: IntegrityPlan, opts: RunOptions): Report {
  return (phase, done, total) => {
    if (!opts.onProgress) return
    try {
      opts.onProgress({ operationId: plan.operationId, phase, done, total })
    } catch {
      // Anzeige-Kanal weg (Fenster geschlossen) — die Transaktion laeuft weiter.
    }
  }
}

/** Trunk/Mirror aus einem reconcile-fsOp rekonstruieren (für reconcile()). */
function reconcilePair(op: IntegrityFsOp): { trunkPath: string; mirrorPath: string } {
  const survivor = op.to ?? ''
  const loser = op.from
  const trunkIsSurvivor = op.decision === 'keep-trunk' || op.decision === 'adopt-mirror'
  return trunkIsSurvivor
    ? { trunkPath: survivor, mirrorPath: loser }
    : { trunkPath: loser, mirrorPath: survivor }
}

/** Eine FS-Operation ausführen; Fehlertext oder null. Journalisiert Moves. */
function runFsOp(op: IntegrityFsOp, journal: IntegrityJournal, opts: RunOptions): string | null {
  const base = { archiveRoot: opts.archiveRoot, auditPath: opts.auditPath, allowedRoots: opts.allowedRoots }
  if (op.action === 'move') {
    const res = applyWrite(
      { action: 'move', path: op.from, to: op.to!, ownerMove: op.ownerMove === true },
      { ...base, skipRefRewrite: true }
    )
    if (res.error || !res.data) return res.error ?? 'move-failed'
    journal.recordMove(op.from, res.data.movedTo ?? op.to!)
    return null
  }
  if (op.action === 'move-dir') {
    const res = applyDirAction(
      { action: 'move-dir', path: op.from, to: op.to!, ownerMove: op.ownerMove === true },
      { ...base, skipRefRewrite: true }
    )
    if (res.error || !res.data) return res.error ?? 'move-dir-failed'
    journal.recordMove(op.from, res.data.movedTo ?? op.to!)
    return null
  }
  // reconcile + reconcile-folder: jede als Einzel-reconcile, aber OHNE internen
  // Referenz-Rewrite (skipRefRewrite) — der lief pro Paar einmal über den ganzen
  // Baum und war die Ursache der minutenlangen Speicher-Dauer. Die Referenzen
  // zieht danach die plan-treue Referenz-Phase nach.
  const pair = reconcilePair(op)
  const res = reconcile(
    { trunkPath: pair.trunkPath, mirrorPath: pair.mirrorPath, decision: op.decision as never },
    { ...base, skipRefRewrite: true }
  )
  if (res.error || !res.data) return res.error ?? 'reconcile-failed'
  if (res.data.mirrorArchivedTo) journal.recordMove(op.from, res.data.mirrorArchivedTo)
  return null
}

interface ReferencePhaseResult {
  rewrittenFiles: string[]
  error: string | null
}

/**
 * Phase reference: plan-treu GENAU die geplanten referenceOps anwenden — für
 * ALLE kinds, auch reconcile/reconcile-folder. Deren fsOps laufen seit dem
 * Performance-Fix mit skipRefRewrite, rewriten also nicht mehr intern; damit
 * kommt im gesamten Apply kein Baum-Walk mehr vor (vorher: ein kompletter Walk
 * je Loser→Survivor-Paar, synchron im Main-Prozess). Die Plan-Ops stammen aus
 * demselben Loser→Survivor-Scan, adopt-Fälle nutzen dieselbe Mapping-Richtung.
 *
 * Semantik-Detail: Ist eine Referenzdatei selbst der archivierte Loser, ist sie
 * am Altpfad nicht mehr lesbar und wird von applyReferenceOps übersprungen —
 * die Archiv-Kopie behält bewusst ihre alten Referenzen (HR7-Beweisstück). Die
 * gezielte Verify-Phase überspringt Unlesbares ebenso, es gibt also keinen
 * Rollback dafür.
 *
 * manualRequired-Dateien (kaputtes JSON, Secret) tragen keine ops und bleiben
 * unangetastet.
 */
function runReferencePhase(
  plan: IntegrityPlan,
  opts: RunOptions,
  report: Report
): ReferencePhaseResult {
  return applyReferenceOps(plan.referenceOps, opts.auditPath, (done, total) => {
    report('references', done, total)
  })
}

function rolledBack(plan: IntegrityPlan, status: RollbackStatus, journalPath: string): IntegrityApplyResult {
  const data: IntegrityApplyData = {
    applied: false, partial: false, operationId: plan.operationId, kind: plan.kind,
    rewrittenFiles: [], rolledBack: status === 'rolled-back',
    rollbackStatus: status, manualRequired: plan.manualRequired, journalPath
  }
  // Erfolgreicher Rollback ist KEIN Fehler nach aussen: error=null, der Zustand
  // ist konsistent zurückgerollt (rolledBack/rollbackStatus tragen die Info).
  // Nur ein FEHLGESCHLAGENER Rollback meldet einen harten Fehler.
  return { data, error: status === 'rollback-failed' ? 'rollback-failed' : null }
}

/** Alle zu sichernden Pfade EINMAL sammeln (dedupe, stabile Reihenfolge). */
function snapshotTargets(plan: IntegrityPlan): string[] {
  const seen = new Set<string>()
  const targets: string[] = []
  const add = (p: string): void => {
    if (!p || seen.has(p)) return
    seen.add(p)
    targets.push(p)
  }
  for (const op of plan.fsOps) {
    add(op.from)
    if (op.to && op.action !== 'move' && op.action !== 'move-dir') add(op.to)
  }
  for (const op of plan.referenceOps) add(op.filePath)
  return targets
}

/** Snapshottet alle Quell-/Ziel-/Referenz-Dateien VOR Mutation (dedupe). */
function runSnapshotPhase(plan: IntegrityPlan, journal: IntegrityJournal, report: Report): void {
  const targets = snapshotTargets(plan)
  let done = 0
  for (const path of targets) {
    if (existsSync(path)) journal.snapshot(path, plan.kind)
    done++
    report('snapshot', done, targets.length)
  }
}

/** Führt die komplette Transaktion aus (Phasen + Rollback). */
export async function runIntegrity(plan: IntegrityPlan, opts: RunOptions): Promise<IntegrityApplyResult> {
  const journal = createJournal(plan.operationId, { archiveRoot: opts.archiveRoot, auditPath: opts.auditPath })
  const report = makeReporter(plan, opts)

  // Phase snapshot — Fehler hier = harter Abbruch VOR Mutation (nichts zu rollen).
  try {
    runSnapshotPhase(plan, journal, report)
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'snapshot-failed' }
  }

  // Phasen fs -> reference -> verify; Fehler -> Rollback.
  let rewrittenFiles: string[] = []
  try {
    let fsDone = 0
    for (const op of plan.fsOps) {
      const e = runFsOp(op, journal, opts)
      if (e) throw new Error(e)
      fsDone++
      report('fs', fsDone, plan.fsOps.length)
    }
    await opts.hooks?.beforeReferences?.()
    const ref = runReferencePhase(plan, opts, report)
    if (ref.error) throw new Error(ref.error)
    rewrittenFiles = ref.rewrittenFiles
    await opts.hooks?.afterReferences?.()
    const verifyErr = runVerifyPhase(plan, (done, total) => report('verify', done, total))
    if (verifyErr) throw new Error(verifyErr)
  } catch {
    const status = journal.rollback()
    const journalPath = journal.persist()
    return rolledBack(plan, status, journalPath)
  }

  // Erfolg.
  const journalPath = journal.persist()
  const moveOp = plan.fsOps.find((o) => o.action === 'move' || o.action === 'move-dir')
  const data: IntegrityApplyData = {
    applied: true, partial: false, operationId: plan.operationId, kind: plan.kind,
    rewrittenFiles,
    movedTo: moveOp?.to, journalPath, rolledBack: false, rollbackStatus: 'none',
    manualRequired: plan.manualRequired
  }
  return { data, error: null }
}
