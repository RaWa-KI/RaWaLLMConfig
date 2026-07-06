import { Icon } from '../../components/Icon'

interface Props {
  candidateCount: number
  detailOpen: boolean
  hasDetail: boolean
  onInspect(): void
  onToggleDetail(): void
}

export function CoverageInspectAction({
  candidateCount,
  detailOpen,
  hasDetail,
  onInspect,
  onToggleDetail,
}: Props) {
  const canCompare = candidateCount >= 2
  return (
    <>
      <button
        type="button"
        className="cvg-icon-btn"
        onClick={onInspect}
        title={canCompare ? `Vergleich mit ${candidateCount} Dateien öffnen` : 'Evidenz anzeigen'}
        aria-label={canCompare ? 'Spiegelungszeile prüfen' : 'Evidenz anzeigen'}
      >
        {Icon.search}
      </button>
      {hasDetail && (
        <button
          type="button"
          className={'cvg-icon-btn' + (detailOpen ? ' open' : '')}
          onClick={onToggleDetail}
          title="Evidenz"
          aria-label="Evidenz"
          aria-expanded={detailOpen}
        >
          {Icon.note}
        </button>
      )}
    </>
  )
}
