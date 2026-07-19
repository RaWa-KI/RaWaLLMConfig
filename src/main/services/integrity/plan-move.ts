// plan-move.ts — Integrity-Plan für Move- und Rename-Operationen (W2/W5).
// Baut deterministischen IntegrityPlan (planHash, fsOps, referenceOps, blockers).
// Schreibt/mutet NIE — reiner Planungs-Layer über scanReferences.
import { randomUUID } from 'node:crypto'
import { dirname, join, isAbsolute, parse, resolve } from 'node:path'
import type { IpcResult } from '@shared/contract'
import type {
  IntegrityPlan,
  IntegrityFsOp,
  ReferenceOp,
  IntegrityBlocker,
  ManualRequiredItem
} from '@shared/contract-integrity'
import type { MoveVersionedRequest, RenameRequest } from '@shared/contract-write-rename'
import { pathsEqual } from '@shared/path-compare'
import { safeStat } from './reference-pairs'
import { scanReferences } from './reference-scan'
import { computePlanHash } from './plan-hash'

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

function fail(reason: string): IpcResult<IntegrityPlan> {
  return { data: null, error: reason }
}

/**
 * Ob from und to auf demselben Laufwerk/Root liegen (plattformgerecht).
 * Cross-Volume-Moves sind nicht sicher rückrollbar (renameSync→EXDEV), daher
 * blockieren wir sie vor jeder Mutation.
 */
function sameVolume(a: string, b: string): boolean {
  return pathsEqual(parse(resolve(a)).root, parse(resolve(b)).root, process.platform)
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

// ── Move-Plan (MoveVersionedRequest) ─────────────────────────────────────

async function buildMoveFsOp(req: MoveVersionedRequest): Promise<IntegrityFsOp | string> {
  if (!req.fromPath || !req.to) return 'invalid-request: fromPath oder to fehlt'
  if (!isAbsolute(req.to)) return 'invalid-request: to muss absoluter Pfad sein'
  const st = safeStat(req.fromPath)
  const isDir = st ? st.isDirectory() : false
  return {
    action: isDir ? 'move-dir' : 'move',
    from: req.fromPath,
    to: req.to,
    ownerMove: true,
    isDir
  }
}

// ── Rename-Plan (RenameRequest) ───────────────────────────────────────────

function buildRenameFsOps(req: RenameRequest): IntegrityFsOp[] | string {
  if (!req.newName || req.newName.includes('/') || req.newName.includes('\\')) {
    return 'invalid-request: newName muss reiner Basisname sein'
  }
  const ops: IntegrityFsOp[] = []
  if ((req.sides === 'beide' || req.sides === 'shared') && req.shared) {
    const from = req.shared.path
    const to = join(dirname(from), req.newName)
    const st = safeStat(from)
    ops.push({ action: st?.isDirectory() ? 'move-dir' : 'move', from, to, isDir: st?.isDirectory() })
  }
  if ((req.sides === 'beide' || req.sides === 'claude') && req.claude) {
    const from = req.claude.path
    const to = join(dirname(from), req.newName)
    const st = safeStat(from)
    ops.push({ action: st?.isDirectory() ? 'move-dir' : 'move', from, to, isDir: st?.isDirectory() })
  }
  if (ops.length === 0) return 'invalid-request: keine Seite angegeben'
  return ops
}

interface ReferenceAggregate {
  ops: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manual: ManualRequiredItem[]
  scannedFiles: number
  truncated: boolean
}

async function scanFsOps(
  fsOps: IntegrityFsOp[],
  operationSources: string[],
  opts: { allowedRoots?: string[] }
): Promise<ReferenceAggregate> {
  const aggregate: ReferenceAggregate = {
    ops: [], blockers: [], manual: [], scannedFiles: 0, truncated: false
  }
  for (const fsOp of fsOps) {
    if (fsOp.to && !sameVolume(fsOp.from, fsOp.to)) {
      aggregate.blockers.push({
        code: 'cross-volume-rollback-not-proven',
        path: fsOp.from,
        reason:
          'Verschieben ueber Laufwerksgrenzen — sicherer Rollback nicht beweisbar; bitte manuell verschieben.'
      })
    }
    const scanResult = await scanReferences(fsOp.from, fsOp.to ?? '', {
      ...opts,
      operationSources
    })
    aggregate.ops.push(...scanResult.ops)
    aggregate.blockers.push(...scanResult.blockers)
    aggregate.manual.push(...scanResult.manualRequired)
    aggregate.scannedFiles += scanResult.scannedFiles
    if (scanResult.truncated) aggregate.truncated = true
  }
  return aggregate
}

// ── Haupt-Export ──────────────────────────────────────────────────────────

/**
 * Baut einen deterministischen IntegrityPlan für Move- oder Rename-Operationen.
 * Ruft scanReferences pro fsOp auf und aggregiert ops/blockers/manualRequired.
 */
export async function planMove(
  input: { kind: 'move' | 'rename'; req: MoveVersionedRequest | RenameRequest },
  opts: { allowedRoots?: string[] }
): Promise<IpcResult<IntegrityPlan>> {
  const { kind, req } = input

  // FS-Operationen aufbauen
  let fsOps: IntegrityFsOp[]
  if (kind === 'move') {
    const result = await buildMoveFsOp(req as MoveVersionedRequest)
    if (typeof result === 'string') return fail(result)
    fsOps = [result]
  } else {
    const result = buildRenameFsOps(req as RenameRequest)
    if (typeof result === 'string') return fail(result)
    fsOps = result
  }

  // Alle Quellen der Operation (für Ambiguity-Ausschluss bei Spiegelungen)
  const operationSources = fsOps.map((o) => o.from)
  const scanned = await scanFsOps(fsOps, operationSources, opts)
  const referenceOps = dedupeOps(scanned.ops)
  const operationId = randomUUID()
  const planHash = computePlanHash(kind, fsOps, referenceOps, {
    blockers: scanned.blockers,
    manualRequired: scanned.manual,
    truncated: scanned.truncated
  })

  return {
    data: {
      operationId,
      planHash,
      kind,
      fsOps,
      referenceOps,
      blockers: scanned.blockers,
      manualRequired: scanned.manual,
      scannedFiles: scanned.scannedFiles,
      truncated: scanned.truncated
    },
    error: null
  }
}
