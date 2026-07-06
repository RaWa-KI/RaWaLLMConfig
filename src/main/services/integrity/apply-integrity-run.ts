// apply-integrity-run.ts — Phasen-Orchestrierung der Integritäts-Transaktion (W3).
// Reihenfolge: snapshot -> fs -> beforeReferences -> reference -> afterReferences
// -> verify. Bei Fehler in fs/reference/verify (inkl. geworfener Hook) Rollback
// über das Journal. NIE applied:true nach Fehler, NIE partial:true.
import { existsSync } from 'node:fs'
import type {
  IntegrityApplyData,
  IntegrityApplyResult,
  IntegrityFsOp,
  IntegrityPlan,
  RollbackStatus
} from '@shared/contract-integrity'
import { applyWrite, applyDirAction } from '../apply'
import { reconcile } from '../reconcile'
import { applyReferenceOps } from './reference-apply'
import { scanReferences } from './reference-scan'
import { createJournal, type IntegrityJournal } from './journal'

export interface RunOptions {
  archiveRoot: string
  auditPath: string
  allowedRoots?: string[]
  hooks?: {
    beforeReferences?: () => void | Promise<void>
    afterReferences?: () => void | Promise<void>
  }
}

const MOVE_KINDS = new Set(['move', 'rename'])

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
  // reconcile + reconcile-folder: jede als Einzel-reconcile (rewritet intern).
  const pair = reconcilePair(op)
  const res = reconcile(
    { trunkPath: pair.trunkPath, mirrorPath: pair.mirrorPath, decision: op.decision as never },
    base
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
 * Phase reference: plan-treu nur die geplanten referenceOps anwenden (nicht neu
 * scannen). reconcile/reconcile-folder rewriten bereits intern (kein Doppel) —
 * daher nur für move/rename. manualRequired-Dateien (kaputtes JSON, Secret)
 * tragen keine ops und bleiben unangetastet.
 */
function runReferencePhase(plan: IntegrityPlan, opts: RunOptions): ReferencePhaseResult {
  if (!MOVE_KINDS.has(plan.kind)) return { rewrittenFiles: [], error: null }
  return applyReferenceOps(plan.referenceOps, opts.auditPath)
}

/** Phase verify: keine Pflicht-Referenz-Ops dürfen mehr offen sein. */
async function runVerifyPhase(plan: IntegrityPlan, opts: RunOptions): Promise<string | null> {
  for (const op of plan.fsOps) {
    if (!op.to) continue
    const scan = await scanReferences(op.from, op.to, { allowedRoots: opts.allowedRoots })
    if (scan.ops.length > 0) return 'verify-failed: alte Pflichtreferenzen verbleiben'
  }
  return null
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

/** Snapshottet alle Quell-/Ziel-/Referenz-Dateien VOR Mutation (dedupe). */
function runSnapshotPhase(plan: IntegrityPlan, journal: IntegrityJournal): void {
  const seen = new Set<string>()
  const snap = (p: string): void => {
    if (!p || seen.has(p)) return
    seen.add(p)
    if (existsSync(p)) journal.snapshot(p, plan.kind)
  }
  for (const op of plan.fsOps) {
    snap(op.from)
    if (op.to && op.action !== 'move' && op.action !== 'move-dir') snap(op.to)
  }
  for (const op of plan.referenceOps) snap(op.filePath)
}

/** Führt die komplette Transaktion aus (Phasen + Rollback). */
export async function runIntegrity(plan: IntegrityPlan, opts: RunOptions): Promise<IntegrityApplyResult> {
  const journal = createJournal(plan.operationId, { archiveRoot: opts.archiveRoot, auditPath: opts.auditPath })

  // Phase snapshot — Fehler hier = harter Abbruch VOR Mutation (nichts zu rollen).
  try {
    runSnapshotPhase(plan, journal)
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : 'snapshot-failed' }
  }

  // Phasen fs -> reference -> verify; Fehler -> Rollback.
  let rewrittenFiles: string[] = []
  try {
    for (const op of plan.fsOps) {
      const e = runFsOp(op, journal, opts)
      if (e) throw new Error(e)
    }
    await opts.hooks?.beforeReferences?.()
    const ref = runReferencePhase(plan, opts)
    if (ref.error) throw new Error(ref.error)
    rewrittenFiles = ref.rewrittenFiles
    await opts.hooks?.afterReferences?.()
    const verifyErr = await runVerifyPhase(plan, opts)
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
