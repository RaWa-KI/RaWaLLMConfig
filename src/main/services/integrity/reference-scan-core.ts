// reference-scan-core.ts — Klassifikation und Treffer-Logik des Referenz-Scans.
// Aus reference-scan.ts herausgeloest (HR27), damit der Batch-Scan die
// paar-unabhaengige Pro-Datei-Arbeit (stat, Secret-/Binary-Klassifikation,
// Lesen, JSON-Parse) EINMAL macht und danach gegen beliebig viele
// alt→neu-Paare auswertet.
// Schreibt NIE, liest NIE Secret-Inhalte, gibt NIE Snippets zurück.
import { extname, resolve } from 'node:path'
import type {
  ReferenceOp,
  ReferenceOpKind,
  ManualRequiredItem
} from '@shared/contract-integrity'
import { normalizePathForCompare } from '@shared/path-compare'
import {
  buildPairs,
  isSecretFile,
  isTextCandidate,
  readTextFile,
  wikiName
} from './reference-pairs'

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

/**
 * Pfade nur an echten Segmentgrenzen erkennen, nicht als Präfix.
 * Auch von der Verify-Phase genutzt (DRY) — dort muss exakt dieselbe
 * Treffer-Definition gelten wie beim Planen.
 */
export function findReferenceIndex(content: string, needle: string): number {
  const pathNeedle = needle.includes('/') || needle.includes('\\')
  let from = 0
  while (true) {
    const idx = content.indexOf(needle, from)
    if (idx === -1) return -1
    const next = content[idx + needle.length]
    if (!pathNeedle || next === undefined || !/[A-Za-z0-9_.-]/.test(next)) return idx
    from = idx + needle.length
  }
}

/** 1-basierte Zeilennummer des ersten echten Vorkommens von needle. */
function firstLineOf(content: string, needle: string): number {
  const idx = findReferenceIndex(content, needle)
  if (idx === -1) return 1
  return content.slice(0, idx).split('\n').length
}

// ── Ambiguous-Wikilink-Check ──────────────────────────────────────────────

/**
 * true, wenn der alte Wiki-Basename mehrdeutig ist.
 * Artefakte in operationSources (alle Quellen der Operation) zählen nicht als
 * fremde Ambiguität — sie sind Teil derselben Operation (Spiegelung beider Seiten).
 */
export function isAmbiguousWikilink(
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
    if (findReferenceIndex(content, pair.needle) === -1) continue
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

// ── Paar-unabhängige Datei-Basis ──────────────────────────────────────────

/** Ergebnis der paar-unabhängigen Klassifikation einer Datei. */
export type FileBase =
  | { kind: 'skip' }
  | { kind: 'manual'; manual: ManualRequiredItem }
  | { kind: 'text'; content: string; brokenJson: boolean }

/**
 * Klassifiziert eine Datei EINMAL: Secret/Binary/Oversize/kein Text-Kandidat
 * oder lesbarer Text (inkl. einmaligem JSON-Parse-Versuch). Enthält bewusst
 * keine Paar-Logik — die kommt in evaluateTextFile dazu.
 */
export function classifyFile(filePath: string): FileBase {
  // Secret → manualRequired, NIE Inhalt lesen
  if (isSecretFile(filePath)) {
    return {
      kind: 'manual',
      manual: { filePath, reason: 'secret-skip: nicht gelesen, manuell prüfen' }
    }
  }
  // Kein Text-Kandidat (Ext) → überspringen
  if (!isTextCandidate(filePath)) return { kind: 'skip' }

  const result = readTextFile(filePath)
  if (!result) return { kind: 'skip' }
  if (result.binary) return { kind: 'manual', manual: { filePath, reason: 'binary' } }
  if (result.oversize) return { kind: 'manual', manual: { filePath, reason: 'oversize' } }

  let brokenJson = false
  if (extname(filePath).toLowerCase() === '.json') {
    try {
      JSON.parse(result.content)
    } catch {
      brokenJson = true
    }
  }
  return { kind: 'text', content: result.content, brokenJson }
}

// ── Pro-Datei-Auswertung für EIN Paar ─────────────────────────────────────

export interface FileProcessResult {
  ops: ReferenceOp[]
  manual: ManualRequiredItem | null
  scanned: boolean
}

/**
 * Wertet eine bereits gelesene Textdatei gegen ein einzelnes alt→neu-Paar aus.
 * Kaputtes JSON mit Bezug zur Operation → manualRequired (nicht automatisch
 * umschreibbar); kaputtes JSON ohne Bezug → normal überspringen.
 */
export function evaluateTextFile(
  filePath: string,
  base: { content: string; brokenJson: boolean },
  oldPath: string,
  newPath: string,
  suppressWikilinks: boolean
): FileProcessResult {
  const { content } = base
  if (base.brokenJson) {
    const needles = buildPairs(oldPath, newPath).map((p) => p.needle)
    const containsAnyNeedle = needles.some((n) => findReferenceIndex(content, n) !== -1)
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

  const ops = collectOpsForContent(filePath, content, oldPath, newPath, suppressWikilinks)
  return { ops, manual: null, scanned: true }
}
