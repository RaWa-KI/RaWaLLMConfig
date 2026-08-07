import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { useLocale } from '../../state/store-locale'
import { useStore } from '../../state/store'
import { DiagnosisCards } from '../overview/DiagnosisCards'
import { navigateToOverviewAction, type OverviewNavigationAction } from '../overview/overview-navigation'
import { selectDiagnosisCards } from '../overview/overview-selectors'
import type { Section } from '../../state/types'

// DiagnosisView (WP3, 2026-07-28): fester Ort der dauerhaften Diagnosekarten
// als eigene Sidebar-Kategorie „Diagnose“ in der Config-Sektion. Die Karten
// stehen nicht mehr im Overview-Kopf — dort weist nur noch eine einzeilige
// Zusammenfassung hierher. Inhalt und Verhalten der Karten (Aufklappen,
// Laien-Schritte, Experten-Details, Modus-Weiche) bleiben unveraendert.
export function DiagnosisView() {
  const { config, system, watcher, ui, actions } = useStore()
  const { locale } = useLocale()
  const cards = selectDiagnosisCards(
    config.data, system.data, watcher.data, config.error, system.error, watcher.error, locale
  )
  const onOpen = (section: Section): void => actions.setSection(section)
  const onOpenExpert = (action: OverviewNavigationAction): void => {
    actions.setDisplayMode('expert')
    navigateToOverviewAction(action, actions.setSection)
  }
  return (
    <>
      <div className="view-head">
        <div className="view-title">
          <h2>
            {Icon.warn}
            {msg('diagnostics.nav.label')}
          </h2>
          <p>{msg('diagnostics.view.blurb')}</p>
        </div>
      </div>
      {cards.length === 0 ? (
        <div className="empty empty-state">
          {Icon.check}
          <p>{msg('diagnostics.view.allClear')}</p>
        </div>
      ) : (
        <DiagnosisCards
          cards={cards}
          displayMode={ui.displayMode}
          onOpen={onOpen}
          onOpenExpert={onOpenExpert}
        />
      )}
    </>
  )
}
