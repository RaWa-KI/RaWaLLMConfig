// diff-lines.ts — Echter zeilenweiser Diff (LCS) zweier Datei-Inhalte -> DiffLine[].
// Liefert die kombinierte Diff-Sequenz mit Flags both/trunkOnly/mirrorOnly, die die
// read-only DiffView 1:1 anzeigt. Reine Stringverarbeitung (kein fs, kein Secret-Read):
// der Aufrufer (dedupe/reconcile) liest Inhalte erst NACH Secret-Guard und gibt sie
// hier hinein. Trunk = kanonische Seite, Mirror = Kopie. Jede Funktion <50 Z.
import type { DiffLine } from '@shared/contract'
import { DIFF_MAX_LINES, DIFF_OVERSIZE_PREFIX } from '@shared/diff-limits'

// Gemeinsames Zeilen-Limit aus shared/diff-limits.ts (identisch mit Renderer-Grenze).
const MAX_LINES = DIFF_MAX_LINES

// Inhalt robust in Zeilen zerlegen (CRLF/CR/LF), trailing-Newline nicht als Leerzeile.
function splitLines(text: string): string[] {
  if (text === '') return []
  const norm = text.replace(/\r\n?/g, '\n')
  const parts = norm.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts
}

// LCS-Laengen-Matrix (klassische DP). a/b sind Zeilen-Arrays.
function lcsMatrix(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  return dp
}

// ctx-Zeile (gleich in trunk+mirror).
function ctxLine(l: string): DiffLine {
  return { l, t: 'ctx', both: true }
}

// del-Zeile (nur in Trunk = kanonisch vorhanden, im Mirror fehlt sie).
function delLine(l: string): DiffLine {
  return { l, t: 'del', trunkOnly: true }
}

// add-Zeile (nur im Mirror = Kopie vorhanden, im Trunk fehlt sie).
function addLine(l: string): DiffLine {
  return { l, t: 'add', mirrorOnly: true }
}

// Aus der LCS-Matrix die kombinierte Diff-Sequenz rekonstruieren.
function walk(a: string[], b: string[], dp: number[][]): DiffLine[] {
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(ctxLine(a[i]))
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(delLine(a[i]))
      i++
    } else {
      out.push(addLine(b[j]))
      j++
    }
  }
  while (i < a.length) out.push(delLine(a[i++]))
  while (j < b.length) out.push(addLine(b[j++]))
  return out
}

// Kompakter Fallback bei sehr grossen Dateien (keine Voll-LCS).
function oversizeDiff(a: string[], b: string[]): DiffLine[] {
  return [
    ctxLine(`${DIFF_OVERSIZE_PREFIX} Trunk ${a.length} Zeilen, Mirror ${b.length} Zeilen (zu gross fuer Voll-Diff)`)
  ]
}

/**
 * Zeilen-Diff zweier Inhalte (trunk vs. mirror) als DiffLine[].
 * ctx = gleich (both), del = nur Trunk (trunkOnly), add = nur Mirror (mirrorOnly).
 * Gibt keine Secret-Werte aus — Inhalte kommen bereits guard-geprueft herein.
 */
export function diffLines(trunkContent: string, mirrorContent: string): DiffLine[] {
  const a = splitLines(trunkContent)
  const b = splitLines(mirrorContent)
  if (a.length > MAX_LINES || b.length > MAX_LINES) return oversizeDiff(a, b)
  if (a.length === 0 && b.length === 0) return []
  const dp = lcsMatrix(a, b)
  return walk(a, b, dp)
}

// Header-Zeile fuer einen gekappten Diff (wird vorangestellt, nie ein Secret-Wert).
function capNote(a: string[], b: string[]): DiffLine {
  return ctxLine(
    `${DIFF_OVERSIZE_PREFIX} Trunk ${a.length} Zeilen, Mirror ${b.length} Zeilen — ` +
      `Vergleich der ersten ${MAX_LINES} Zeilen je Seite`
  )
}

/**
 * Zeilen-Diff mit hartem Cap statt leerem Ergebnis bei grossen Dateien (WP-D1).
 * Liefert IMMER vergleichbare Zeilen: bei Ueberschreitung von MAX_LINES wird je
 * Seite auf MAX_LINES gekappt, ein Hinweis vorangestellt und truncated=true
 * gesetzt — die Anzeige bleibt nutzbar statt „nichts". Reine Stringverarbeitung,
 * Inhalte kommen guard-/masken-geprueft herein (kein Secret-Wert).
 */
export function diffLinesCapped(
  trunkContent: string,
  mirrorContent: string
): { lines: DiffLine[]; truncated: boolean } {
  const a = splitLines(trunkContent)
  const b = splitLines(mirrorContent)
  if (a.length === 0 && b.length === 0) return { lines: [], truncated: false }
  const over = a.length > MAX_LINES || b.length > MAX_LINES
  if (!over) return { lines: walk(a, b, lcsMatrix(a, b)), truncated: false }
  const ca = a.slice(0, MAX_LINES)
  const cb = b.slice(0, MAX_LINES)
  return { lines: [capNote(a, b), ...walk(ca, cb, lcsMatrix(ca, cb))], truncated: true }
}
