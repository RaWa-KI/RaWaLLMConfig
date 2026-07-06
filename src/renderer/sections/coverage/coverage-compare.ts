import type { CoverageCell, CoverageRow } from '@shared/contract-coverage'
import type { CompareCandidate } from '@shared/contract-compare'
import type {
  CoverageCompareCellContext,
  CoverageComparePreset,
  CoverageComparePresetSource,
  CoverageCompareRowContext,
} from '../../state/types'

type FamilyId = 'shared' | 'claude' | 'codex'

export interface CoverageCellView {
  id: FamilyId
  label: string
  cell: CoverageCell
  notes: string[]
}

const FAMILIES: Array<{ id: FamilyId; label: string }> = [
  { id: 'shared', label: 'Shared' },
  { id: 'claude', label: 'Claude' },
  { id: 'codex', label: 'Codex' },
]

function stateNote(cell: CoverageCell): string | null {
  if (cell.state === 'via-plugin') return 'Plugin-Indiz, kein Dateinachweis.'
  if (cell.state === 'fehlt') return 'Kein Dateipfad gefunden.'
  if (cell.state === 'n-a') return 'Für diese Familie nicht anwendbar.'
  if (cell.state === 'vorhanden') return 'Datei vorhanden; Inhalt nicht als identischer Match geprüft.'
  return null
}

function notesFor(cell: CoverageCell): string[] {
  return [cell.note, stateNote(cell)].filter((n): n is string => !!n)
}

function cellFor(row: CoverageRow, id: FamilyId): CoverageCell {
  return row[id]
}

export function coverageCells(row: CoverageRow): CoverageCellView[] {
  return FAMILIES.map(({ id, label }) => {
    const cell = cellFor(row, id)
    return { id, label, cell, notes: notesFor(cell) }
  })
}

export function coverageCandidates(row: CoverageRow): CompareCandidate[] {
  return coverageCells(row)
    .filter(({ cell }) => !!cell.path)
    .map(({ id, label, cell }) => ({
      id: `coverage:${row.cat}:${row.name}:${id}`,
      path: cell.path as string,
      label: `${label}: ${row.name}`,
      origin: label,
      secret: row.masked || undefined,
    }))
}

export function coverageRowContext(row: CoverageRow): CoverageCompareRowContext {
  const cells: CoverageCompareCellContext[] = coverageCells(row).map(({ id, label, cell, notes }) => ({
    id,
    label,
    state: cell.state,
    path: cell.path ?? null,
    note: cell.note ?? null,
    notes,
  }))
  return { cat: row.cat, name: row.name, cells }
}

export function coveragePreset(
  row: CoverageRow,
  createdFrom: CoverageComparePresetSource,
): CoverageComparePreset {
  return {
    source: 'coverage',
    row: coverageRowContext(row),
    candidates: coverageCandidates(row),
    createdFrom,
  }
}
