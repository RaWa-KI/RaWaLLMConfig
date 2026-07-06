// plan-hash.ts — Kanonischer Plan-Hash (SSoT für plan-move, plan-reconcile,
// apply-integrity). Eine einzige Hash-Methode, damit das Hash-Gate beim Apply
// niemals gegen eine divergierende Berechnung läuft. Keine Secret-Werte.
import { createHash } from 'node:crypto'
import type {
  IntegrityBlocker,
  IntegrityFsOp,
  ManualRequiredItem,
  ReferenceOp
} from '@shared/contract-integrity'

export interface PlanHashMeta {
  blockers?: IntegrityBlocker[]
  manualRequired?: ManualRequiredItem[]
  truncated?: boolean
}

function sortFs(fsOps: IntegrityFsOp[]): IntegrityFsOp[] {
  return [...fsOps].sort((a, b) =>
    (a.from + (a.to ?? '') + (a.rel ?? '')).localeCompare(b.from + (b.to ?? '') + (b.rel ?? ''))
  )
}

function sortRef(referenceOps: ReferenceOp[]): ReferenceOp[] {
  return [...referenceOps].sort((a, b) =>
    a.filePath !== b.filePath
      ? a.filePath.localeCompare(b.filePath)
      : a.oldValue.localeCompare(b.oldValue)
  )
}

function sortBlockers(blockers: IntegrityBlocker[] = []): IntegrityBlocker[] {
  return [...blockers].sort((a, b) =>
    (a.code + (a.path ?? '') + a.reason).localeCompare(b.code + (b.path ?? '') + b.reason)
  )
}

function sortManual(items: ManualRequiredItem[] = []): ManualRequiredItem[] {
  return [...items].sort((a, b) =>
    (a.filePath + (a.line ?? 0) + a.reason).localeCompare(b.filePath + (b.line ?? 0) + b.reason)
  )
}

/**
 * SHA-256-Hex über kanonisches JSON (ohne operationId). fsOps und referenceOps
 * werden stabil sortiert, damit dieselbe logische Operation immer denselben
 * Hash ergibt — unabhängig von der Reihenfolge der Aggregation.
 */
export function computePlanHash(
  kind: string,
  fsOps: IntegrityFsOp[],
  referenceOps: ReferenceOp[],
  meta: PlanHashMeta = {}
): string {
  const canonical = JSON.stringify({
    kind,
    fsOps: sortFs(fsOps),
    referenceOps: sortRef(referenceOps),
    blockers: sortBlockers(meta.blockers),
    manualRequired: sortManual(meta.manualRequired),
    truncated: meta.truncated === true
  })
  return createHash('sha256').update(canonical).digest('hex')
}
