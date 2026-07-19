import type { DisplayMode, Mode } from '../../state/types'
import { Icon } from '../../components/Icon'
import { msgMode } from '../../lib/messages'

// Kategorie-Modi-Tabs (aus ConfigSection extrahiert, HR27 + Teil E, Owner-Entscheid
// D1–D3): simple blendet die Register-Modi „Spiegelung" (Diff-Tab der Shared-Familie)
// und „Vergleich" wirklich aus (kein CSS-Versteck); der Duplikate-Tab bekommt den
// Alltagsnamen aus der Message-Projektion („Doppelte Einträge"). Expert sieht alle
// Modi unveraendert — der Shared-Diff-Tab behaelt dort das Label „Spiegelung".
export function CategoryModeTabs({
  displayMode,
  mode,
  isShared,
  mirrorLabel,
  diffBadge,
  onMode
}: {
  displayMode: DisplayMode
  mode: Mode
  isShared: boolean
  mirrorLabel: string
  diffBadge: number
  onMode(mode: Mode): void
}) {
  const expert = displayMode === 'expert'
  return (
    <div className="mode-tabs">
      <button
        type="button"
        className={'mode-tab' + (mode === 'overview' ? ' on' : '')}
        onClick={() => onMode('overview')}
      >
        {Icon.list}Übersicht
      </button>
      {(expert || !isShared) && (
        <button
          type="button"
          className={'mode-tab' + (mode === 'diff' ? ' on' : '')}
          onClick={() => onMode('diff')}
        >
          {Icon.diff}{isShared ? mirrorLabel : msgMode(displayMode, 'config.mode.duplicates')}
          {diffBadge > 0 && <span className="mt-badge">{diffBadge}</span>}
        </button>
      )}
      {expert && (
        <button
          type="button"
          className={'mode-tab' + (mode === 'compare' ? ' on' : '')}
          onClick={() => onMode('compare')}
        >
          {Icon.merge}Vergleich
        </button>
      )}
    </div>
  )
}
