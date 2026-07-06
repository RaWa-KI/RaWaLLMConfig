// compare-multi.ts — Multi-Way-Vergleichs-Aggregator (Präsenz-Masken-Union).
//
// Algorithmus (Q2 LOCKED 2026-06-08):
//   - N Kandidaten → N Spalten; je Spalte: Größen-Guard → readText → displayText
//   - normalisierte Zeilen per Spalte (CRLF→LF, trailing-Leerzeile gedropt)
//   - Union aller DISTINKTEN Zeilen in Erstvorkommens-Reihenfolge (Spalte 0 zuerst)
//   - Präsenz-Maske presence[i]: Zeile ∈ Zeilenmenge von Spalte i?
//   - Klassifikation: dup = in allen verfügbaren, partial = >1 aber <N, unique = genau 1
// Rein-leere/whitespace-only Zeilen werden aus der Klassifikation ausgelassen
// (Kommentar: trailing-Whitespace-Zeilen erzeugen sonst Rauschen bei partial-Befunden).
//
// SECURITY: Inhalte NUR über displayText maskiert; kein roher Secret-Wert in
// Result/Log. readFileSync/readText nur intern in dedupe-content.ts — hier nur statSync.

import { statSync } from 'node:fs'
import type { CompareCandidate, CompareColumn, MultiCompareLine, MultiCompareResult } from '@shared/contract-compare'
import { readText, displayText } from './dedupe-content'
import { diffLinesCapped } from './diff-lines'

// 2 MB Größengrenze — pathologische Binärdateien (GGUF etc.) nicht einlesen.
const MAX_BYTES = 2 * 1024 * 1024

// Union-Limit: verhindert, dass ein pathologisches Input das UI sprengt.
const MAX_UNION_LINES = 5000

// ---------------------------------------------------------------------------
// Interne Hilfstypen
// ---------------------------------------------------------------------------

interface LoadedColumn {
  column: CompareColumn
  lines: string[] // normalisierte, maskierte Zeilen (leer wenn !available)
}

// ---------------------------------------------------------------------------
// Helper: eine Kandidaten-Spalte laden
// ---------------------------------------------------------------------------

function loadColumn(candidate: CompareCandidate): LoadedColumn {
  const base: Omit<CompareColumn, 'masked' | 'available' | 'oversize'> = {
    path: candidate.path,
    label: candidate.label,
    origin: candidate.origin,
  }

  // Größen-Guard: bei überschrittenem Limit Platzhalter-Spalte, kein Crash.
  let size = 0
  try {
    size = statSync(candidate.path).size
  } catch (err) {
    fail('statSync', err)
    return { column: { ...base, masked: false, available: false }, lines: [] }
  }

  if (size > MAX_BYTES) {
    return {
      column: { ...base, masked: false, available: false, oversize: true },
      lines: [],
    }
  }

  // Inhalt AUSSCHLIESSLICH über readText + displayText (secret-guarded).
  const raw = readText(candidate.path)
  if (raw === null) {
    return { column: { ...base, masked: false, available: false }, lines: [] }
  }

  // displayText entscheidet selbst über Maskierung — candidate.secret NICHT vertrauen.
  const { text, masked } = displayText(candidate.path, raw)
  const lines = normalizeLines(text)

  return {
    column: { ...base, masked, available: true },
    lines,
  }
}

// ---------------------------------------------------------------------------
// Helper: Text in normalisierte Zeilenliste überführen
// ---------------------------------------------------------------------------

function normalizeLines(text: string): string[] {
  const parts = text.replace(/\r\n?/g, '\n').split('\n')
  // trailing leere Zeile droppen
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

// ---------------------------------------------------------------------------
// Helper: Präsenz-Union über alle verfügbaren Spalten aufbauen
// ---------------------------------------------------------------------------

function buildPresence(loaded: LoadedColumn[]): {
  distinctLines: string[]
  presenceMatrix: boolean[][]
  truncated: boolean
} {
  const availIdx = loaded.map((_, i) => i).filter((i) => loaded[i].column.available)

  // Reihenfolge: Erstvorkommens (Spalte 0 zuerst, dann neue aus Spalte 1, …)
  const seen = new Map<string, number>() // Zeile → Index in distinctLines
  const distinctLines: string[] = []
  let truncated = false

  for (const i of availIdx) {
    for (const line of loaded[i].lines) {
      // Rein-leere/whitespace-only Zeilen aus Klassifikation ausschließen.
      if (line.trim() === '') continue
      if (!seen.has(line)) {
        if (distinctLines.length >= MAX_UNION_LINES) {
          truncated = true
          break
        }
        seen.set(line, distinctLines.length)
        distinctLines.push(line)
      }
    }
    if (truncated) break
  }

  // Präsenz-Matrix: für jede distinkte Zeile, je Spalte i: enthält Spalte i die Zeile?
  const N = loaded.length
  const lineSets: Set<string>[] = loaded.map((l) =>
    l.column.available ? new Set(l.lines.filter((ln) => ln.trim() !== '')) : new Set()
  )

  const presenceMatrix: boolean[][] = distinctLines.map((line) =>
    Array.from({ length: N }, (_, i) => lineSets[i].has(line))
  )

  return { distinctLines, presenceMatrix, truncated }
}

// ---------------------------------------------------------------------------
// Helper: Zeile klassifizieren
// ---------------------------------------------------------------------------

function classify(presence: boolean[], availCount: number): import('@shared/contract-compare').MultiLineKind {
  // Bei < 2 lesbaren Spalten ist kein Quervergleich/Dedup moeglich — jede
  // praesente Zeile ist (hoechstens) in EINER Datei -> 'unique' (nie 'dup', sonst
  // falsche Dedup-Empfehlung; deckt availCount 0 UND 1 ab). kritiker-Auflage P2.
  if (availCount < 2) return 'unique'
  const trueCount = presence.filter(Boolean).length
  if (trueCount === availCount) return 'dup'
  if (trueCount === 1) return 'unique'
  return 'partial'
}

// ---------------------------------------------------------------------------
// Helper: echtes LCS-Zeilen-Alignment bei GENAU 2 lesbaren Spalten
// ---------------------------------------------------------------------------

/**
 * Bei genau 2 verfügbaren Spalten echtes LCS-Alignment (statt Präsenz-Union):
 * A = erste verfügbare Spalte (kanonisch/trunk), B = zweite (mirror). Beide
 * `lines` sind bereits normalisiert UND maskiert — KEIN neuer fs-Read, KEIN
 * roher Secret-Wert. diffLinesCapped liefert die echte Alignment-Reihenfolge.
 * presence wird generisch über die tatsächlichen Spalten-Indizes von A und B
 * gebaut (Länge === columns.length). Gibt das fertige MultiCompareResult zurück.
 */
function lcsAlign(loaded: LoadedColumn[]): MultiCompareResult {
  const N = loaded.length
  const availIdx = loaded.map((_, i) => i).filter((i) => loaded[i].column.available)
  const [ai, bi] = availIdx // genau 2 (vom Aufrufer garantiert)
  const A = loaded[ai]
  const B = loaded[bi]

  const { lines: diff, truncated } = diffLinesCapped(A.lines.join('\n'), B.lines.join('\n'))

  const lines: MultiCompareLine[] = diff.map((d) => {
    // presence über die echten Spalten-Indizes (Rest bleibt false).
    const presence = Array.from({ length: N }, () => false)
    if (d.t === 'add') {
      presence[bi] = true // nur in Mirror (B) vorhanden
      return { text: d.l, presence, kind: 'unique', masked: B.column.masked || undefined }
    }
    if (d.t === 'del') {
      presence[ai] = true // nur in Trunk (A) vorhanden
      return { text: d.l, presence, kind: 'unique', masked: A.column.masked || undefined }
    }
    // both: in beiden gleich → Dedup-Kandidat
    presence[ai] = true
    presence[bi] = true
    return { text: d.l, presence, kind: 'dup', masked: (A.column.masked || B.column.masked) || undefined }
  })

  return {
    columns: loaded.map((l) => l.column),
    lines,
    dupCount: lines.filter((l) => l.kind === 'dup').length,
    inconsistentCount: lines.filter((l) => l.kind !== 'dup').length,
    anyMasked: loaded.some((l) => l.column.masked),
    truncated: truncated || undefined,
  }
}

// ---------------------------------------------------------------------------
// Haupt-Export
// ---------------------------------------------------------------------------

/**
 * Multi-Way-Vergleichs-Aggregator: lädt N Kandidaten (secret-guarded).
 * Bei genau 2 lesbaren Spalten: echtes LCS-Zeilen-Alignment (diff-lines.ts).
 * Sonst: Präsenz-Masken-Union + Dup-/Inkonsistenz-Klassifikation.
 */
export function compareMulti(candidates: CompareCandidate[]): MultiCompareResult {
  // Spalten laden
  const loaded: LoadedColumn[] = candidates.map(loadColumn)

  // LCS-Pfad nur bei GENAU 2 lesbaren Spalten (echtes Alignment statt Union).
  if (loaded.filter((l) => l.column.available).length === 2) {
    return lcsAlign(loaded)
  }

  // Präsenz-Union aufbauen
  const { distinctLines, presenceMatrix, truncated } = buildPresence(loaded)

  const availCount = loaded.filter((l) => l.column.available).length

  // MultiCompareLines zusammenstellen
  const lines: MultiCompareLine[] = distinctLines.map((text, idx) => {
    const presence = presenceMatrix[idx]
    const kind = classify(presence, availCount)

    // masked = true wenn mindestens eine Quell-Spalte maskiert ist
    // und die Zeile in dieser Spalte präsent ist.
    const masked = loaded.some((l, i) => l.column.masked && presence[i])

    return { text, presence, kind, masked: masked || undefined }
  })

  // Counts
  const dupCount = lines.filter((l) => l.kind === 'dup').length
  const inconsistentCount = lines.filter((l) => l.kind !== 'dup').length
  const anyMasked = loaded.some((l) => l.column.masked)

  return {
    columns: loaded.map((l) => l.column),
    lines,
    dupCount,
    inconsistentCount,
    anyMasked,
    truncated: truncated || undefined,
  }
}

// ---------------------------------------------------------------------------
// Internes Logging ohne Secret-/Pfad-Ausgabe
// ---------------------------------------------------------------------------

function fail(where: string, err: unknown): void {
  console.error(
    `[scan:compare-multi:${where}]`,
    err instanceof Error ? err.message : 'unbekannt'
  )
}
