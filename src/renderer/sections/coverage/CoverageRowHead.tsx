import type { CoverageRow as CoverageRowData } from '@shared/contract-coverage'
import { Icon } from '../../components/Icon'
import { CoverageBadge } from './CoverageBadge'
import { CoverageInspectAction } from './CoverageInspectAction'

interface Props {
  row: CoverageRowData
  candidateCount: number
  hasDetail: boolean
  detailOpen: boolean
  diffOpen: boolean
  hasDiff: boolean
  onInspect(): void
  onToggleDetail(): void
  onToggleDiff(): void
}

export function CoverageRowHead({
  row,
  candidateCount,
  hasDetail,
  detailOpen,
  diffOpen,
  hasDiff,
  onInspect,
  onToggleDetail,
  onToggleDiff,
}: Props) {
  return (
    <div className="cvg-row-head">
      <div className="cvg-cell cvg-cell--name">
        <span className="cvg-row-name">{row.name}</span>
        {row.shared.path && <span className="cvg-row-path">{row.shared.path}</span>}
      </div>
      <div className="cvg-cell">
        <CoverageBadge state={row.shared.state} path={row.shared.path} note={row.shared.note} />
      </div>
      <div className="cvg-cell">
        <CoverageBadge state={row.claude.state} path={row.claude.path} note={row.claude.note} />
      </div>
      <div className="cvg-cell">
        <CoverageBadge state={row.codex.state} path={row.codex.path} note={row.codex.note} />
      </div>
      <div className="cvg-row-tools">
        <CoverageInspectAction
          candidateCount={candidateCount}
          detailOpen={detailOpen}
          hasDetail={hasDetail}
          onInspect={onInspect}
          onToggleDetail={onToggleDetail}
        />
        {hasDiff && (
          <button
            type="button"
            className={'cvg-expand-btn' + (diffOpen ? ' open' : '')}
            onClick={onToggleDiff}
            aria-expanded={diffOpen}
            title="Diff anzeigen"
          >
            {Icon.diff}
          </button>
        )}
      </div>
    </div>
  )
}
