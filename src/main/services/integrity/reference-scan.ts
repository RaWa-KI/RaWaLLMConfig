// reference-scan.ts — Exhaustiver Dry-Run-Scan für Referenz-Ops/Blocker.
// Klassifiziert alle Dateien in allowedRoots: Secret → manualRequired,
// binary/oversize → manualRequired, lesbarer Text → ReferenceOp-Treffer.
// Schreibt NIE, liest NIE Secret-Inhalte, gibt NIE Snippets zurück.
import { extname, resolve } from 'node:path'
import type {
  ReferenceOp,
  ReferenceOpKind,
  IntegrityBlocker,
  ManualRequiredItem
} from '@shared/contract-integrity'
import { normalizePathForCompare } from '@shared/path-compare'
import {
  buildPairs,
  collectAllFiles,
  isSecretFile,
  isTextCandidate,
  readTextFile,
  wikiName,
  safeStat
} from './reference-pairs'

// ── Öffentliches Ergebnis ─────────────────────────────────────────────────

export interface ReferenceScanResult {
  ops: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manualRequired: ManualRequiredItem[]
  scannedFiles: number
  truncated: boolean
}

// ── Klassifikations-Hilfsfunktionen ──────────────────────────────────────

const GOVERNANCE_FIELDS = ['canonical_source', 'loader_path']
const LOADER_FIELDS = ['CLAUDE_SKILL_DIR', 'CODEX_SKILL_DIR', 'LOADER_PATH']

/** Bestimmt ReferenceOpKind anhand des Needle-Typs und Zeilen-Kontexts. */
function classifyOp(needle: string, lineContent: string): ReferenceOpKind {
  if (needle.startsWith('[[')) return 'wikilink'
  if (GOVERNANCE_FIELDS.some((f) => lineContent.includes(f))) return 'governance-dependency'
  if (LOADER_FIELDS.some((f) => lineContent.includes(f))) return 'loader-default'
  return 'path'
}

/** Extrahiert feld-Name aus einer Zeile (governance-dependency / loader-default). */
function extractField(lineContent: string): string | undefined {
  for (const f of [...GOVERNANCE_FIELDS, ...LOADER_FIELDS]) {
    if (lineContent.includes(f)) return f
  }
  return undefined
}

/** 1-basierte Zeilennummer des ersten Vorkommens von needle. */
function firstLineOf(content: string, needle: string): number {
  const idx = content.indexOf(needle)
  if (idx === -1) return 1
  return content.slice(0, idx).split('\n').length
}

// ── Ambiguous-Wikilink-Check ──────────────────────────────────────────────

/**
 * true, wenn der alte Wiki-Basename mehrdeutig ist.
 * Artefakte in operationSources (alle Quellen der Operation) zählen nicht als
 * fremde Ambiguität — sie sind Teil derselben Operation (Spiegelung beider Seiten).
 */
function isAmbiguousWikilink(
  oldPath: string,
  allFiles: string[],
  operationSources: string[]
): boolean {
  const target = wikiName(oldPath)
  const normalizedOld = normalizePathForCompare(resolve(oldPath), process.platform)
  const normalizedSources = operationSources.map((source) => (
    normalizePathForCompare(resolve(source), process.platform)
  ))

  let foreignCount = 0
  for (const f of allFiles) {
    if (wikiName(f) !== target) continue
    const nf = normalizePathForCompare(resolve(f), process.platform)
    // oldPath selbst und alle operationSources ausschließen
    if (nf === normalizedOld) continue
    if (normalizedSources.includes(nf)) continue
    foreignCount++
    if (foreignCount >= 1) return true
  }
  return false
}

// ── Ops für eine lesbare Text-Datei sammeln ───────────────────────────────

function collectOpsForContent(
  filePath: string,
  content: string,
  oldPath: string,
  newPath: string,
  suppressWikilinks: boolean
): ReferenceOp[] {
  const pairs = buildPairs(oldPath, newPath)
  const lines = content.split('\n')
  const ops: ReferenceOp[] = []

  for (const pair of pairs) {
    if (suppressWikilinks && pair.needle.startsWith('[[')) continue
    if (!content.includes(pair.needle)) continue
    const lineNum = firstLineOf(content, pair.needle)
    const lineContent = lines[lineNum - 1] ?? ''
    const kind = classifyOp(pair.needle, lineContent)
    const field =
      kind === 'governance-dependency' || kind === 'loader-default'
        ? extractField(lineContent)
        : undefined
    ops.push({
      filePath,
      kind,
      field,
      line: lineNum,
      oldValue: pair.needle,
      newValue: pair.replacement
    })
  }
  return ops
}

// ── Pro-Datei-Verarbeitung ────────────────────────────────────────────────

interface FileProcessResult {
  ops: ReferenceOp[]
  manual: ManualRequiredItem | null
  scanned: boolean
}

function processFile(
  filePath: string,
  oldPath: string,
  newPath: string,
  suppressWikilinks: boolean
): FileProcessResult {
  // Secret → manualRequired, NIE Inhalt lesen
  if (isSecretFile(filePath)) {
    return {
      ops: [],
      manual: { filePath, reason: 'secret-skip: nicht gelesen, manuell prüfen' },
      scanned: false
    }
  }

  // Kein Text-Kandidat (Ext) → überspringen
  if (!isTextCandidate(filePath)) {
    return { ops: [], manual: null, scanned: false }
  }

  const result = readTextFile(filePath)
  if (!result) return { ops: [], manual: null, scanned: false }

  if (result.binary) {
    return { ops: [], manual: { filePath, reason: 'binary' }, scanned: false }
  }
  if (result.oversize) {
    return { ops: [], manual: { filePath, reason: 'oversize' }, scanned: false }
  }

  const { content } = result

  // Kaputtes JSON: nicht parsbar + enthält irgendeine Pfadform → manualRequired
  if (extname(filePath).toLowerCase() === '.json') {
    try {
      JSON.parse(content)
    } catch {
      // Parse-Fehler: prüfen ob irgendeine Pfadform der Operation enthalten ist
      const needles = buildPairs(oldPath, newPath).map((p) => p.needle)
      const containsAnyNeedle = needles.some((n) => content.includes(n))
      if (containsAnyNeedle) {
        return {
          ops: [],
          manual: { filePath, reason: 'invalid-json: nicht automatisch umschreibbar' },
          scanned: true
        }
      }
      // Kein Treffer → normal überspringen (kein Bezug zur Operation)
      return { ops: [], manual: null, scanned: false }
    }
  }

  const ops = collectOpsForContent(filePath, content, oldPath, newPath, suppressWikilinks)
  return { ops, manual: null, scanned: true }
}

// ── Haupt-Export ──────────────────────────────────────────────────────────

/**
 * Exhaustiver Dry-Run: findet alle ReferenceOps, Blocker und manualRequired-
 * Einträge für eine oldPath→newPath-Verschiebung über allowedRoots.
 * Schreibt NIE. Liest NIE Secret-Inhalte. Enthält NIE Snippets im Output.
 */
export async function scanReferences(
  oldPath: string,
  newPath: string,
  opts: { allowedRoots?: string[]; operationSources?: string[] }
): Promise<ReferenceScanResult> {
  const empty: ReferenceScanResult = {
    ops: [], blockers: [], manualRequired: [], scannedFiles: 0, truncated: false
  }

  if (!oldPath || !newPath || oldPath === newPath) return empty
  const roots = (opts.allowedRoots ?? []).filter(Boolean)
  if (roots.length === 0) return empty

  // Alle Dateien sammeln (für Ambiguous-Check und Scan)
  const allFiles: string[] = []
  for (const root of roots) collectAllFiles(root, allFiles)

  // Ambiguous-Wikilink-Check: Basename ändert sich + fremdes Artefakt mit dem Namen
  const operationSources = opts.operationSources ?? []
  const blockers: IntegrityBlocker[] = []
  let suppressWikilinks = false
  if (wikiName(oldPath) !== wikiName(newPath) && isAmbiguousWikilink(oldPath, allFiles, operationSources)) {
    suppressWikilinks = true
    blockers.push({
      code: 'ambiguous-wikilink',
      path: oldPath,
      reason: `Wikilink-Basename "${wikiName(oldPath)}" ist mehrdeutig — manuell prüfen`
    })
  }

  const ops: ReferenceOp[] = []
  const manualRequired: ManualRequiredItem[] = []
  let scannedFiles = 0

  for (const filePath of allFiles) {
    const st = safeStat(filePath)
    if (!st || !st.isFile()) continue
    const res = processFile(filePath, oldPath, newPath, suppressWikilinks)
    if (res.scanned) scannedFiles++
    if (res.manual) manualRequired.push(res.manual)
    ops.push(...res.ops)
  }

  // Dedupe: gleiche (filePath, oldValue, newValue) → nur einmal
  const seen = new Set<string>()
  const dedupedOps: ReferenceOp[] = []
  for (const op of ops) {
    const key = `${op.filePath}\0${op.oldValue}\0${op.newValue}`
    if (!seen.has(key)) { seen.add(key); dedupedOps.push(op) }
  }

  return { ops: dedupedOps, blockers, manualRequired, scannedFiles, truncated: false }
}
