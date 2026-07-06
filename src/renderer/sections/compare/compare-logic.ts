// compare-logic.ts
// Alignment-Transformation fuer die N-Spalten-Side-by-side-Ansicht (WP-5).
// Wandelt das Multi-Way-Aggregat (MultiCompareResult, Praesenz-Maske je Zeile)
// in zeilen-alignte Spalten: jede MultiCompareLine ist EINE Zeile ueber ALLE
// Spalten — in Spalte j sichtbar wenn presence[j]===true, sonst Platzhalter.
// So sind alle Spalten exakt gleich lang (= lines.length) und Zeilen liegen
// deckungsgleich nebeneinander. Reine Daten-Transformation, kein fs/IPC.

import type {
  CompareColumn,
  MultiCompareResult,
  MultiLineKind
} from '@shared/contract-compare'

// Eine alignte Zelle: text ist nur gesetzt wenn present (sonst leerer Platzhalter,
// der die Ausrichtung haelt). kind traegt die Multi-Way-Klassifikation der Zeile.
// fold (optional): gesetzt = diese Zelle steht stellvertretend fuer einen Lauf von
// N aufeinanderfolgenden Leer-Platzhaltern (Leerlauf-Faltung, eine kompakte Markierung).
export interface AlignedCell {
  text: string
  present: boolean
  kind: MultiLineKind
  fold?: number
}

// Eine Spalte: Metadaten (Kopf) + gleich lange Zellen-Liste (= lines.length).
export interface AlignedColumn {
  col: CompareColumn
  cells: AlignedCell[]
}

// Eine Spalte j ausrichten: pro Zeile i die Praesenz-Maske auswerten. Bei
// present -> der normalisierte (ggf. maskierte) Zeilentext, sonst leer.
function alignOne(result: MultiCompareResult, j: number): AlignedCell[] {
  return result.lines.map((line) => ({
    text: line.presence[j] ? line.text : '',
    present: line.presence[j] === true,
    kind: line.kind
  }))
}

// Leerlauf-Faltung: jeden MAXIMALEN Lauf aufeinanderfolgender !present-Zellen
// durch GENAU EINE Platzhalter-Zelle { fold:N } ersetzen (N = Lauflaenge); kind
// uebernimmt die erste Zelle des Laufs. present-Zellen bleiben unveraendert in
// Reihenfolge. So kollabiert die Leerzeilen-Flut zu einer kompakten Markierung.
export function foldGaps(cells: AlignedCell[]): AlignedCell[] {
  const out: AlignedCell[] = []
  let i = 0
  while (i < cells.length) {
    if (cells[i].present) {
      out.push(cells[i])
      i++
      continue
    }
    // Lauf aufeinanderfolgender !present-Zellen messen.
    const start = i
    while (i < cells.length && !cells[i].present) i++
    const run = cells.slice(start, i)
    out.push({ text: '', present: false, kind: run[0].kind, fold: run.length })
  }
  return out
}

// Alle Spalten ausrichten. Ergebnis: pro Spalte eine cells-Liste, in der Leer-
// Platzhalter-Laeufe je Spalte zu einer kompakten fold-Markierung gefaltet sind.
export function alignColumns(result: MultiCompareResult): AlignedColumn[] {
  return result.columns.map((col, j) => ({ col, cells: foldGaps(alignOne(result, j)) }))
}
