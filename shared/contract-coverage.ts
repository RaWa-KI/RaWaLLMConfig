// Coverage-Typen fuer die Spiegelungs-Matrix (Cross-Tool-Abdeckung).
// Additiv zu contract.ts — bestehende Typen bleiben unveraendert.
// Nur auf der 'shared'-Familie befuellt; fehlt das Feld -> Renderer unveraendert.

import type { DiffLine, DirCompare } from './contract'

// Zell-Status einer Spalte (Shared / Claude / Codex) pro Config-Zeile.
export type CoverageState =
  | 'identisch'
  | 'abweichend'
  | 'fehlt'
  | 'via-plugin'
  | 'n-a'
  | 'vorhanden'

// Einzelne Zelle in der Spiegelungs-Matrix.
export interface CoverageCell {
  state: CoverageState
  path?: string
  note?: string
}

// Eine Zeile der Spiegelungs-Matrix (eine logische Config ueber alle Tool-Familien).
// lines/dir/masked fuer den Drift-Drilldown bei 'abweichend' — reuse bestehende Diff-Anzeige.
export interface CoverageRow {
  cat: string
  name: string
  shared: CoverageCell
  claude: CoverageCell
  codex: CoverageCell
  impact?: string
  lines?: DiffLine[]
  dir?: DirCompare
  masked?: boolean
}
