import type { CoverageRow as CoverageRowData } from '@shared/contract-coverage'
import { useVirtualRows } from '../../lib/useVirtualRows'
import { CoverageRow } from './CoverageRow'

interface Props {
  rows: CoverageRowData[]
  onInspect(row: CoverageRowData): void
}

// Kopfzeile der Spiegelungs-Matrix. Sie ist per CSS sticky (siehe
// CoverageView.css) und traegt die semantischen Spaltenkoepfe: ohne die
// columnheader-Rolle liest ein Screenreader nur „fehlt, vorhanden, n/a"
// ohne jeden Bezug zum Werkzeug.
function CoverageTableHead() {
  return (
    <div className="cvg-thead" role="row">
      <div className="cvg-th cvg-th--name" role="columnheader">Config</div>
      <div className="cvg-th" role="columnheader">Shared</div>
      <div className="cvg-th" role="columnheader">Claude</div>
      <div className="cvg-th" role="columnheader">Codex</div>
      <div className="cvg-th" role="columnheader">Kimi</div>
      <div className="cvg-th cvg-th--expand" role="columnheader" aria-label="Aktionen" />
    </div>
  )
}

export function CoverageVirtualTable({ rows, onInspect }: Props) {
  const enabled = rows.length > 80
  const virtual = useVirtualRows({ count: rows.length, estimateSize: 58, enabled })
  const indexes = enabled ? virtual.virtualItems : rows.map((_, i) => i)
  return (
    <div className="cvg-table" role="table" aria-label="Spiegelungs-Matrix: Config je Shared, Claude, Codex und Kimi">
      <CoverageTableHead />
      <div className="cvg-tbody" role="rowgroup" ref={virtual.ref}>
        {/* Platzhalter der Virtualisierung: reine Hoehe, keine Tabellenzeilen. */}
        {enabled && <div style={{ height: virtual.beforeHeight }} aria-hidden="true" />}
        {indexes.map((i) => {
          const row = rows[i]
          return <CoverageRow key={row.cat + '/' + row.name} row={row} onInspect={onInspect} />
        })}
        {enabled && <div style={{ height: virtual.afterHeight }} aria-hidden="true" />}
      </div>
    </div>
  )
}
