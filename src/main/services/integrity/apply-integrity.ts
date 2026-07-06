// apply-integrity.ts — Integrity-Transaktionsschicht (W3): Preview + Apply.
// Preview dispatcht an plan-move/plan-reconcile; Apply prüft Hash-/Blocker-Gate
// und führt die transaktionale Phasen-Sequenz (apply-integrity-run) aus.
// Eine Operation ist nur erfolgreich, wenn FS-Zustand UND Referenzgraph konsistent
// sind; sonst Rollback. Trägt NIE rohe Secret-Werte.
import type {
  IntegrityApplyResult,
  IntegrityPreviewResult,
  IntegrityApplyRequest,
  IntegrityPreviewRequest
} from '@shared/contract-integrity'
import { planMove } from './plan-move'
import { planReconcile } from './plan-reconcile'
import { computePlanHash } from './plan-hash'
import { signPreviewPlan, verifyPreviewToken } from './plan-token'
import { runIntegrity } from './apply-integrity-run'
import { assertInScope } from '../path-scope'
import { isSecretPathForRead } from '../secret-guard'

// Optionale Hooks: werden VOR/NACH dem Referenz-Rewrite-Schritt aufgerufen.
// Ermöglichen Tests, Fehler an gezielten Stellen zu injizieren.
export interface IntegrityHooks {
  beforeReferences?: () => void | Promise<void>
  afterReferences?: () => void | Promise<void>
}

export interface IntegrityApplyOptions {
  archiveRoot: string
  auditPath: string
  allowedRoots?: string[]
  hooks?: IntegrityHooks
}

function fsSourcesInScope(plan: { fsOps: Array<{ from: string }> }, roots?: string[]): string | null {
  if (!roots || roots.length === 0) return null
  for (const op of plan.fsOps) {
    const scope = assertInScope(op.from, roots)
    if (!scope.writable) return scope.reason ?? 'out-of-scope'
  }
  return null
}

function referenceOpsAllowed(
  plan: { referenceOps: Array<{ filePath: string }> },
  roots?: string[]
): string | null {
  if (!roots || roots.length === 0) return null
  for (const op of plan.referenceOps) {
    if (isSecretPathForRead(op.filePath)) return 'owner-only/not-in-scope'
    const scope = assertInScope(op.filePath, roots)
    if (!scope.writable) return scope.reason ?? 'out-of-scope'
  }
  return null
}

// Dispatch nach Operationsart: move/rename -> planMove, sonst planReconcile.
export async function previewIntegrity(
  req: IntegrityPreviewRequest,
  opts: IntegrityApplyOptions
): Promise<IntegrityPreviewResult> {
  const passOpts = { allowedRoots: opts.allowedRoots }
  const signResult = async (res: Promise<IntegrityPreviewResult>): Promise<IntegrityPreviewResult> => {
    const out = await res
    if (!out.data) return out
    return { ...out, data: { ...out.data, previewToken: signPreviewPlan(out.data) } }
  }
  if (req.kind === 'move' || req.kind === 'rename') {
    return signResult(planMove({ kind: req.kind, req: req.req }, passOpts))
  }
  return signResult(planReconcile({ kind: req.kind, req: req.req }, passOpts))
}

// Transaktionaler Apply: Hash-Gate -> Blocker-Gate -> Phasen-Sequenz/Rollback.
export async function applyIntegrity(
  req: IntegrityApplyRequest,
  opts: IntegrityApplyOptions
): Promise<IntegrityApplyResult> {
  const { plan, planHash } = req

  // 1) Hash-Gate: Apply nur gegen den bestätigten, unveränderten Plan.
  const recomputed = computePlanHash(plan.kind, plan.fsOps, plan.referenceOps, {
    blockers: plan.blockers,
    manualRequired: plan.manualRequired,
    truncated: plan.truncated
  })
  if (recomputed !== planHash || plan.planHash !== planHash) {
    return { data: null, error: 'plan-hash-mismatch' }
  }
  if (!verifyPreviewToken(plan)) {
    return { data: null, error: 'plan-token-mismatch' }
  }

  // 2) Blocker-Gate: harte Blocker verhindern jede Mutation. Ein blockierter Plan
  // ist gueltig, aber nicht anwendbar -> graceful applied:false ohne Fehler
  // (der Aufrufer kennt die Blocker aus dem Plan). Kein FS-Touch.
  if (plan.blockers.length > 0) {
    return {
      data: {
        applied: false,
        partial: false,
        operationId: plan.operationId,
        kind: plan.kind,
        rewrittenFiles: [],
        rolledBack: false,
        rollbackStatus: 'none',
        manualRequired: plan.manualRequired
      },
      error: null
    }
  }

  const scopeError = fsSourcesInScope(plan, opts.allowedRoots)
  if (scopeError) return { data: null, error: scopeError }
  const refScopeError = referenceOpsAllowed(plan, opts.allowedRoots)
  if (refScopeError) return { data: null, error: refScopeError }

  // 3) Phasen-Sequenz mit Journal-Rollback.
  return runIntegrity(plan, {
    archiveRoot: opts.archiveRoot,
    auditPath: opts.auditPath,
    allowedRoots: opts.allowedRoots,
    hooks: opts.hooks
  })
}
