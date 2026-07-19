// Coverage-Typen fuer die Spiegelungs-Matrix (Cross-Tool-Abdeckung).
// Additiv zu contract.ts — bestehende Typen bleiben unveraendert.
// Nur auf der 'shared'-Familie befuellt; fehlt das Feld -> Renderer unveraendert.

import type { DiffLine, DirCompare, IpcResult } from './contract'

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

export interface CoverageAck {
  key: string
}

export interface CoverageAckData {
  acknowledgements: CoverageAck[]
}

export interface CoverageWriteAckRequest {
  key: string
}

// Stabiler Ack-Schluessel eines Coverage-Eintrags (E-WP3): familyId ist der
// Record-Key aus AppData.data (scan-index applyCoverageAcks nutzt denselben),
// 'userglobal' wird auf 'source' gemappt, der userglobal-Prefix der entry.id
// wird gestrippt. Pure Funktion — Shared, damit Scan (Main) und Selector
// (Renderer) garantiert denselben Key bauen.
export function coverageEntryKey(familyId: string, categoryId: string, entryId: string): string {
  const family = familyId === 'userglobal' ? 'source' : familyId
  return `${family}:${categoryId}:${entryId.replace(/^userglobal-[^-]+-/, '')}`
}

// Preload-Bridge (E-WP3 L1): readCoverageAcks ungated, writeCoverageAck im
// Main via isWriteEnabled() gegated. Keys sind wertfrei (kein Inhalt/Pfad-Wert).
export interface CoverageApi {
  readCoverageAcks(): Promise<IpcResult<CoverageAckData>>
  writeCoverageAck(req: CoverageWriteAckRequest): Promise<IpcResult<CoverageAckData>>
}
