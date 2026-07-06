import type { CoverageRow as CoverageRowData } from '@shared/contract-coverage'
import { useVirtualRows } from '../../lib/useVirtualRows'
import { CoverageRow } from './CoverageRow'

interface Props {
  rows: CoverageRowData[]
  onInspect(row: CoverageRowData): void
}

function CoverageTableHead() {
  return (
    <div className="cvg-thead">
      <div className="cvg-th cvg-th--name">Config</div>
      <div className="cvg-th">Shared</div>
      <div className="cvg-th">Claude</div>
      <div className="cvg-th">Codex</div>
      <div className="cvg-th cvg-th--expand" aria-hidden="true" />
    </div>
  )
}

export function CoverageVirtualTable({ rows, onInspect }: Props) {
  const enabled = rows.length > 80
  const virtual = useVirtualRows({ count: rows.length, estimateSize: 58, enabled })
  const indexes = enabled ? virtual.virtualItems : rows.map((_, i) => i)
  return (
    <div className="cvg-table">
      <CoverageTableHead />
      <div className="cvg-tbody" ref={virtual.ref}>
        {enabled && <div style={{ height: virtual.beforeHeight }} />}
        {indexes.map((i) => {
          const row = rows[i]
          return <CoverageRow key={row.cat + '/' + row.name} row={row} onInspect={onInspect} />
        })}
        {enabled && <div style={{ height: virtual.afterHeight }} />}
      </div>
    </div>
  )
}
