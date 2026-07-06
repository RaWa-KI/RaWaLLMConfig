import type { CoverageRow } from '@shared/contract-coverage'
import { CoverageBadge } from './CoverageBadge'
import { coverageCells } from './coverage-compare'

interface Props {
  row: CoverageRow
}

export function CoverageDetail({ row }: Props) {
  return (
    <div className="cvg-detail">
      {coverageCells(row).map(({ id, label, cell, notes }) => (
        <div key={id} className="cvg-detail-cell">
          <div className="cvg-detail-head">
            <span className="cvg-detail-label">{label}</span>
            <CoverageBadge state={cell.state} path={cell.path} note={cell.note} />
          </div>
          {cell.path && <div className="cvg-detail-path">{cell.path}</div>}
          {notes.map((note) => (
            <div key={note} className="cvg-detail-note">{note}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
