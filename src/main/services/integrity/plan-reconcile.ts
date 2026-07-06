// plan-reconcile.ts — Integrity-Plan für Reconcile- und DirReconcile-Operationen (W2/W6).
// Baut deterministischen IntegrityPlan auf Basis der echten Loser/Survivor-Semantik
// aus reconcile.ts und reconcile-folder.ts. Schreibt/mutet NIE.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { IpcResult } from '@shared/contract'
import type {
  IntegrityPlan,
  IntegrityFsOp,
  ReferenceOp,
  IntegrityBlocker,
  ManualRequiredItem
} from '@shared/contract-integrity'
import type { ReconcileRequest } from '@shared/contract-write-reconcile'
import type { DirReconcileRequest } from '@shared/contract-write-reconcile'

import { scanReferences } from './reference-scan'
import { computePlanHash } from './plan-hash'

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

function fail(reason: string): IpcResult<IntegrityPlan> {
  return { data: null, error: reason }
}

/** Dedupliziert ReferenceOps nach (filePath, oldValue, newValue). */
function dedupeOps(ops: ReferenceOp[]): ReferenceOp[] {
  const seen = new Set<string>()
  return ops.filter((op) => {
    const key = `${op.filePath}\0${op.oldValue}\0${op.newValue}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ── Loser/Survivor aus ReconcilePairDecision ──────────────────────────────

/**
 * Gibt loserPath und survivorPath für eine Einzel-Reconcile-Entscheidung zurück.
 * Spiegelt die Semantik aus reconcile.ts (keepSide/adoptSide).
 */
function loserSurvivorForSingle(
  req: ReconcileRequest
): { loser: string; survivor: string } | null {
  switch (req.decision) {
    case 'keep-trunk':   return { loser: req.mirrorPath, survivor: req.trunkPath }
    case 'keep-mirror':  return { loser: req.trunkPath,  survivor: req.mirrorPath }
    case 'adopt-mirror': return { loser: req.mirrorPath, survivor: req.trunkPath }
    case 'adopt-trunk':  return { loser: req.trunkPath,  survivor: req.mirrorPath }
    default:             return null
  }
}

// ── DirReconcile: rel-Pfad Loser/Survivor-Mapping ────────────────────────

type DirDecision = 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk'

function isActionableDecision(d: string): d is DirDecision {
  return d === 'keep-trunk' || d === 'keep-mirror' || d === 'adopt-mirror' || d === 'adopt-trunk'
}

function loserSurvivorForRel(
  rel: string,
  decision: DirDecision,
  trunkPath: string,
  mirrorPath: string
): { loser: string; survivor: string } {
  const trunkFile = join(trunkPath, rel)
  const mirrorFile = join(mirrorPath, rel)
  switch (decision) {
    case 'keep-trunk':   return { loser: mirrorFile, survivor: trunkFile }
    case 'keep-mirror':  return { loser: trunkFile,  survivor: mirrorFile }
    case 'adopt-mirror': return { loser: mirrorFile, survivor: trunkFile }
    case 'adopt-trunk':  return { loser: trunkFile,  survivor: mirrorFile }
  }
}

// ── Scan-Aggregation ──────────────────────────────────────────────────────

interface AggregateResult {
  ops: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manualRequired: ManualRequiredItem[]
  scannedFiles: number
  truncated: boolean
}

async function aggregateScans(
  mappings: Array<{ loser: string; survivor: string }>,
  opts: { allowedRoots?: string[] }
): Promise<AggregateResult> {
  const allOps: ReferenceOp[] = []
  const allBlockers: IntegrityBlocker[] = []
  const allManual: ManualRequiredItem[] = []
  let scannedFiles = 0
  let truncated = false

  for (const { loser, survivor } of mappings) {
    const scan = await scanReferences(loser, survivor, opts)
    allOps.push(...scan.ops)
    allBlockers.push(...scan.blockers)
    allManual.push(...scan.manualRequired)
    scannedFiles += scan.scannedFiles
    if (scan.truncated) truncated = true
  }

  return { ops: dedupeOps(allOps), blockers: allBlockers, manualRequired: allManual, scannedFiles, truncated }
}

// ── Haupt-Export: planReconcile ───────────────────────────────────────────

/**
 * Baut einen deterministischen IntegrityPlan für Reconcile- oder
 * DirReconcile-Operationen. Pro Loser→Survivor-Mapping wird scanReferences
 * aufgerufen. Schreibt/mutet NIE.
 */
export async function planReconcile(
  input: { kind: 'reconcile' | 'reconcile-folder'; req: ReconcileRequest | DirReconcileRequest },
  opts: { allowedRoots?: string[] }
): Promise<IpcResult<IntegrityPlan>> {
  const { kind, req } = input

  if (kind === 'reconcile') {
    const singleReq = req as ReconcileRequest
    if (!singleReq.trunkPath || !singleReq.mirrorPath || !singleReq.decision) {
      return fail('invalid-request: trunkPath, mirrorPath und decision erforderlich')
    }

    const mapping = loserSurvivorForSingle(singleReq)
    if (!mapping) return fail('invalid-decision')

    const fsOps: IntegrityFsOp[] = [{
      action: 'reconcile',
      from: mapping.loser,
      to: mapping.survivor,
      decision: singleReq.decision
    }]

    const agg = await aggregateScans([mapping], opts)
    const operationId = randomUUID()
    const planHash = computePlanHash(kind, fsOps, agg.ops, {
      blockers: agg.blockers,
      manualRequired: agg.manualRequired,
      truncated: agg.truncated
    })

    return {
      data: {
        operationId, planHash, kind, fsOps,
        referenceOps: agg.ops,
        blockers: agg.blockers,
        manualRequired: agg.manualRequired,
        scannedFiles: agg.scannedFiles,
        truncated: agg.truncated
      },
      error: null
    }
  }

  // reconcile-folder
  const dirReq = req as DirReconcileRequest
  if (!dirReq.trunkPath || !dirReq.mirrorPath || !dirReq.decisions) {
    return fail('invalid-request: trunkPath, mirrorPath und decisions erforderlich')
  }

  const fsOps: IntegrityFsOp[] = []
  const mappings: Array<{ loser: string; survivor: string }> = []

  for (const [rel, decision] of Object.entries(dirReq.decisions)) {
    if (!isActionableDecision(decision)) continue
    const { loser, survivor } = loserSurvivorForRel(rel, decision, dirReq.trunkPath, dirReq.mirrorPath)
    fsOps.push({ action: 'reconcile-folder', from: loser, to: survivor, decision, rel })
    mappings.push({ loser, survivor })
  }

  if (fsOps.length === 0) {
    // Keine aktionablen Entscheidungen → leerer Plan
    const operationId = randomUUID()
    const planHash = computePlanHash(kind, [], [], { blockers: [], manualRequired: [], truncated: false })
    return {
      data: {
        operationId, planHash, kind, fsOps: [],
        referenceOps: [], blockers: [], manualRequired: [],
        scannedFiles: 0, truncated: false
      },
      error: null
    }
  }

  const agg = await aggregateScans(mappings, opts)
  const operationId = randomUUID()
  const planHash = computePlanHash(kind, fsOps, agg.ops, {
    blockers: agg.blockers,
    manualRequired: agg.manualRequired,
    truncated: agg.truncated
  })

  return {
    data: {
      operationId, planHash, kind, fsOps,
      referenceOps: agg.ops,
      blockers: agg.blockers,
      manualRequired: agg.manualRequired,
      scannedFiles: agg.scannedFiles,
      truncated: agg.truncated
    },
    error: null
  }
}
