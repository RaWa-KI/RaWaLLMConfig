import { Fragment, useMemo } from 'react'
import type { LlmConfig } from '@shared/contract'
import { msg } from '../../lib/messages'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { CategoryNavItem } from './config-parts'
import { categoryLabel } from './category-label'
import { groupCategoriesBySource } from './category-groups'
import { DIAGNOSIS_CAT_ID } from './diagnosis-cat'

// CategorySidebar — aus ConfigSection.tsx extrahiert (HR27-Split, WP3
// 2026-07-28). Gruppierung nach Quell-Werkzeug (WP-9): die Userglobal-Familie
// zeigte gleichnamige Achsen (Agents/Agents/Skills) flach untereinander; jetzt
// traegt jede Gruppe eine Zwischenueberschrift und jedes Label sein Quell-
// Praefix. Reine Anzeige — Filter/Dedupe laufen weiter ueber normalizeCat.
// WP3: OBERHALB der Kategorien steht der feste Menuepunkt „Diagnose“ mit der
// Anzahl offener Karten als Badge — die dauerhaften Diagnosekarten haben hier
// ihren eigenen Ort (statt im Overview-Kopf).
export function CategorySidebar({
  ad,
  catId,
  searching,
  diagnosisCount,
  onPick
}: {
  ad: LlmConfig
  catId: string | null
  searching: boolean
  diagnosisCount: number
  onPick(id: string): void
}) {
  const { ui } = useStore()
  const groups = useMemo(() => groupCategoriesBySource(ad.categories), [ad.categories])
  return (
    <aside className="sidebar">
      <div className="side-label">Kategorien</div>
      <button
        type="button"
        className={'nav-item' + (catId === DIAGNOSIS_CAT_ID && !searching ? ' on' : '')}
        onClick={() => onPick(DIAGNOSIS_CAT_ID)}
      >
        <span className="ni-ic">{Icon.warn}</span>
        <span className="ni-txt">{msg('diagnostics.nav.label')}</span>
        <span className="ni-count">{diagnosisCount}</span>
      </button>
      {groups.map((g) => (
        <Fragment key={g.key}>
          {g.title && <div className="side-label">{g.title}</div>}
          {g.categories.map((c) => (
            <CategoryNavItem
              key={c.id}
              cat={c}
              label={categoryLabel(ui.displayMode, c)}
              active={catId === c.id && !searching}
              onPick={onPick}
            />
          ))}
        </Fragment>
      ))}
      {ad.categories.length === 0 && <div className="empty-state">Noch keine Kategorien.</div>}
    </aside>
  )
}
