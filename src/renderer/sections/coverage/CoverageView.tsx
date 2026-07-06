import type { CoverageRow as CoverageRowData } from '@shared/contract-coverage'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { CoverageVirtualTable } from './CoverageVirtualTable'
import { coveragePreset } from './coverage-compare'
import './CoverageView.css'
import './CoverageDetail.css'

// CoverageView — Spiegelungs-Matrix fuer die Shared-Familie.
// Zeigt pro logischer Config eine Zeile mit den Spalten Shared / Claude / Codex.
// Reine Anzeige (read-only) — keine Schreibaktionen, keine neuen IPC-Pfade.
// Daten kommen von aussen (ad.coverage gefiltert per cat.id in CategoryView).

interface Props {
  rows: CoverageRowData[]
}

// Leerzustand: keine Coverage-Daten fuer diese Kategorie.
function CoverageEmpty() {
  return (
    <div className="cvg-empty">
      {Icon.check}
      <p>Keine Spiegelungs-Daten für diese Kategorie.</p>
    </div>
  )
}

export function CoverageView({ rows }: Props) {
  const { ui, actions } = useStore()
  function inspectRow(row: CoverageRowData) {
    actions.setComparePreset(coveragePreset(row, {
      section: ui.section,
      llm: ui.llm,
      catId: ui.catId,
      rowId: `coverage:${row.cat}:${row.name}`,
      createdAt: new Date().toISOString(),
    }))
    actions.setMode('compare')
  }

  if (rows.length === 0) {
    return (
      <div className="cvg-view">
        <CoverageEmpty />
      </div>
    )
  }
  return (
    <div className="cvg-view">
      <CoverageVirtualTable rows={rows} onInspect={inspectRow} />
    </div>
  )
}
