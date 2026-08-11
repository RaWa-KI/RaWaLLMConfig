// reference-scan.ts — Exhaustiver Dry-Run-Scan für Referenz-Ops/Blocker.
// Klassifiziert alle Dateien in allowedRoots: Secret → manualRequired,
// binary/oversize → manualRequired, lesbarer Text → ReferenceOp-Treffer.
// Schreibt NIE, liest NIE Secret-Inhalte, gibt NIE Snippets zurück.
//
// Batch-Prinzip (Performance): Der Baum wird EINMAL gewalkt und jede Datei
// EINMAL gelesen; danach wird der Inhalt gegen ALLE alt→neu-Paare der Operation
// ausgewertet (Schleifen-Umkehr Datei→Paar statt Paar→Datei). Vorher las ein
// Ordner-Reconcile mit N Paaren den ganzen Baum N-mal.
// Das Ergebnis je Paar ist semantisch identisch zum früheren Einzel-Scan.
import type {
  ReferenceOp,
  IntegrityBlocker,
  ManualRequiredItem
} from '@shared/contract-integrity'
import { collectAllFiles, safeStat, wikiName } from './reference-pairs'
import {
  classifyFile,
  evaluateTextFile,
  isAmbiguousWikilink
} from './reference-scan-core'

export { findReferenceIndex } from './reference-scan-core'

// ── Öffentliches Ergebnis ─────────────────────────────────────────────────

export interface ReferenceScanResult {
  ops: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manualRequired: ManualRequiredItem[]
  scannedFiles: number
  truncated: boolean
}

/** Ein alt→neu-Paar einer Operation (fsOp bzw. Loser→Survivor). */
export interface ScanPair {
  oldPath: string
  newPath: string
}

export interface ScanOptions {
  allowedRoots?: string[]
  operationSources?: string[]
}

function emptyResult(): ReferenceScanResult {
  return { ops: [], blockers: [], manualRequired: [], scannedFiles: 0, truncated: false }
}

// ── Paar-Zustand während des einen Datei-Durchlaufs ───────────────────────

interface PairState {
  active: boolean
  oldPath: string
  newPath: string
  suppressWikilinks: boolean
  ops: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manualRequired: ManualRequiredItem[]
  scannedFiles: number
}

/**
 * Legt je Paar den Startzustand an und führt den Ambiguous-Wikilink-Check
 * gegen dieselbe (einmal gesammelte) Dateiliste durch.
 */
function initPairStates(
  pairs: ScanPair[],
  allFiles: string[],
  operationSources: string[]
): PairState[] {
  return pairs.map((pair) => {
    const active = Boolean(pair.oldPath) && Boolean(pair.newPath) && pair.oldPath !== pair.newPath
    const state: PairState = {
      active,
      oldPath: pair.oldPath,
      newPath: pair.newPath,
      suppressWikilinks: false,
      ops: [],
      blockers: [],
      manualRequired: [],
      scannedFiles: 0
    }
    if (!active) return state
    const oldWiki = wikiName(pair.oldPath)
    if (oldWiki !== wikiName(pair.newPath)
      && isAmbiguousWikilink(pair.oldPath, allFiles, operationSources)) {
      state.suppressWikilinks = true
      state.blockers.push({
        code: 'ambiguous-wikilink',
        path: pair.oldPath,
        reason: `Wikilink-Basename "${oldWiki}" ist mehrdeutig — manuell prüfen`
      })
    }
    return state
  })
}

/** Eine einmal gelesene Datei gegen alle aktiven Paare auswerten. */
function applyFileToStates(filePath: string, states: PairState[]): void {
  const base = classifyFile(filePath)
  if (base.kind === 'skip') return
  if (base.kind === 'manual') {
    for (const state of states) {
      if (state.active) state.manualRequired.push({ ...base.manual })
    }
    return
  }
  for (const state of states) {
    if (!state.active) continue
    const res = evaluateTextFile(
      filePath, base, state.oldPath, state.newPath, state.suppressWikilinks
    )
    if (res.scanned) state.scannedFiles++
    if (res.manual) state.manualRequired.push(res.manual)
    state.ops.push(...res.ops)
  }
}

/** Dedupe je Paar: gleiche (filePath, oldValue, newValue) → nur einmal. */
function finalizeState(state: PairState): ReferenceScanResult {
  const seen = new Set<string>()
  const dedupedOps: ReferenceOp[] = []
  for (const op of state.ops) {
    const key = `${op.filePath}\0${op.oldValue}\0${op.newValue}`
    if (!seen.has(key)) {
      seen.add(key)
      dedupedOps.push(op)
    }
  }
  return {
    ops: dedupedOps,
    blockers: state.blockers,
    manualRequired: state.manualRequired,
    scannedFiles: state.scannedFiles,
    truncated: false
  }
}

// ── Haupt-Exporte ─────────────────────────────────────────────────────────

/**
 * Exhaustiver Dry-Run für MEHRERE alt→neu-Paare in EINEM Baum-Durchlauf.
 * Liefert je Eingabepaar genau ein Ergebnis (gleiche Reihenfolge), semantisch
 * identisch zum Einzelaufruf von scanReferences. Schreibt NIE.
 */
export async function scanReferencesBatch(
  pairs: ScanPair[],
  opts: ScanOptions
): Promise<ReferenceScanResult[]> {
  if (pairs.length === 0) return []
  const roots = (opts.allowedRoots ?? []).filter(Boolean)
  if (roots.length === 0) return pairs.map(() => emptyResult())

  // Alle Dateien EINMAL sammeln (für Ambiguous-Check und Scan)
  const allFiles: string[] = []
  for (const root of roots) collectAllFiles(root, allFiles)

  const states = initPairStates(pairs, allFiles, opts.operationSources ?? [])
  if (!states.some((state) => state.active)) return pairs.map(() => emptyResult())

  for (const filePath of allFiles) {
    const st = safeStat(filePath)
    if (!st || !st.isFile()) continue
    applyFileToStates(filePath, states)
  }

  return states.map((state) => (state.active ? finalizeState(state) : emptyResult()))
}

/**
 * Exhaustiver Dry-Run: findet alle ReferenceOps, Blocker und manualRequired-
 * Einträge für eine oldPath→newPath-Verschiebung über allowedRoots.
 * Dünner Wrapper über scanReferencesBatch (ein Paar) — bestehende Aufrufer
 * und Specs bleiben unverändert gültig.
 */
export async function scanReferences(
  oldPath: string,
  newPath: string,
  opts: ScanOptions
): Promise<ReferenceScanResult> {
  const [result] = await scanReferencesBatch([{ oldPath, newPath }], opts)
  return result ?? emptyResult()
}
