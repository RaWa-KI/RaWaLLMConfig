import type { CoverageCell, CoverageRow as CoverageRowData, CoverageState } from '@shared/contract-coverage'
import { Icon } from '../../components/Icon'
import { CoverageBadge } from './CoverageBadge'
import { CoverageInspectAction } from './CoverageInspectAction'

// Vorlesbare Statusnamen. Bewusst ausformuliert (nicht die kurzen Badge-Texte
// aus CoverageBadge): „n/a" oder „Plugin-Indiz" ergeben vorgelesen keinen Sinn.
const SPOKEN_STATE: Record<CoverageState, string> = {
  identisch: 'identisch',
  abweichend: 'abweichend',
  fehlt: 'fehlt',
  'via-plugin': 'nur ueber Plugin belegt',
  'n-a': 'nicht anwendbar',
  vorhanden: 'vorhanden',
}

// Eine Status-Zelle. Das aria-label stellt den Bezug Badge -> Werkzeug her
// („Codex: fehlt"); visuell steht die Zuordnung nur ueber die Spaltenposition,
// die ein Screenreader nicht sehen kann.
function CoverageStatusCell({ tool, cell }: { tool: string; cell: CoverageCell }) {
  return (
    <div className="cvg-cell" role="cell" aria-label={`${tool}: ${SPOKEN_STATE[cell.state]}`}>
      <CoverageBadge state={cell.state} path={cell.path} note={cell.note} />
    </div>
  )
}

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

// Fallback fuer Rows ohne befuellte Kimi-Zelle (Altbestand-Konstruktoren;
// buildCoverage befuellt row.kimi immer — WP-8, B9).
const KIMI_CELL_FALLBACK: CoverageCell = { state: 'n-a', note: 'Kimi-Zelle nicht befüllt' }

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
    <div className="cvg-row-head" role="row">
      <div className="cvg-cell cvg-cell--name" role="cell">
        <span className="cvg-row-name">{row.name}</span>
        {row.shared.path && <span className="cvg-row-path">{row.shared.path}</span>}
      </div>
      <CoverageStatusCell tool="Shared" cell={row.shared} />
      <CoverageStatusCell tool="Claude" cell={row.claude} />
      <CoverageStatusCell tool="Codex" cell={row.codex} />
      <CoverageStatusCell tool="Kimi" cell={row.kimi ?? KIMI_CELL_FALLBACK} />
      <div className="cvg-row-tools" role="cell">
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
