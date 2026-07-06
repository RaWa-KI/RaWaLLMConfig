import type { AlignedCell, AlignedColumn } from './compare-logic'
import { MaskedBadge, OversizeHint } from '../config/diff-shared'
import { useVirtualRows } from '../../lib/useVirtualRows'
import { LoadHintBadge } from './LoadHintBadge'

function cellCls(cell: AlignedCell): string {
  if (!cell.present) return 'del'
  return cell.kind === 'dup' ? 'ctx' : 'add'
}

function cellSign(cell: AlignedCell): string {
  if (!cell.present) return '−'
  return cell.kind === 'dup' ? '' : '+'
}

function ColHead({ col }: { col: AlignedColumn['col'] }) {
  return (
    <div className="diff-col-head cmp-col-head">
      <span className="dc-title">{col.label}</span>
      {col.origin && <span className="dc-origin">{col.origin}</span>}
      <span className="cmp-col-load-slot" data-wp6-slot="col-load">
        <LoadHintBadge path={col.path} origin={col.origin} />
      </span>
      <span className="dc-path mono" title={col.path}>{col.path}</span>
      <span className="cmp-col-tags">{col.masked && <MaskedBadge />}</span>
    </div>
  )
}

function CompareCell({ cell, index }: { cell: AlignedCell; index: number }) {
  if (cell.fold) {
    return <div className="dline fold" key={index}>··· {cell.fold} Zeile(n) nur in anderen Dateien ···</div>
  }
  return (
    <div className={'dline ' + cellCls(cell)} key={index}>
      <span className="dgut">{cellSign(cell)}</span>
      {cell.present ? cell.text : ''}
    </div>
  )
}

function CompareColumnVirtual({ column }: { column: AlignedColumn }) {
  const { col, cells } = column
  const enabled = cells.length > 160
  const virtual = useVirtualRows({ count: cells.length, estimateSize: 23, overscan: 20, enabled })
  const indexes = enabled ? virtual.virtualItems : cells.map((_, i) => i)
  return (
    <div className="diff-col cmp-col">
      <ColHead col={col} />
      {col.oversize && <OversizeHint />}
      {!col.available ? (
        <div className="cmp-col-missing">Datei nicht lesbar oder nicht gefunden — keine Zeilen vergleichbar.</div>
      ) : (
        <div className="diff-body" ref={virtual.ref}>
          {enabled && <div style={{ height: virtual.beforeHeight }} />}
          {indexes.map((i) => <CompareCell key={i} cell={cells[i]} index={i} />)}
          {enabled && <div style={{ height: virtual.afterHeight }} />}
        </div>
      )}
    </div>
  )
}

export function CompareVirtualRows({ columns }: { columns: AlignedColumn[] }) {
  return (
    <>
      {columns.map((column, j) => (
        <CompareColumnVirtual key={column.col.path + ':' + j} column={column} />
      ))}
    </>
  )
}
