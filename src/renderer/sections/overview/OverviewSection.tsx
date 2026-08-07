import { useCallback } from 'react'
import { Icon } from '../../components/Icon'
import { DisplayModeSwitch } from '../../components/DisplayModeSwitch'
import { useDisplayModeSwitch } from '../../components/useDisplayModeSwitch'
import { msg } from '../../lib/messages'
import { useLocale } from '../../state/store-locale'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import type { Section } from '../../state/types'
import { DIAGNOSIS_CAT_ID } from '../config/diagnosis-cat'
import { CoverageAckLine, CoverageRegister } from './CoverageRegister'
import { GuidedFlows } from './GuidedFlows'
import { StatusStamp } from './StatusStamp'
import { TaskCard } from './TaskCard'
import { pickNextDiagnosisCard } from './diagnosis-model'
import type { GuidedFlow } from './guided-flows-model'
import type { OverviewModel, OverviewReadiness, OverviewTask, OverviewTone } from './overview-model'
import { navigateToOverviewAction, type OverviewNavigationAction } from './overview-navigation'
import {
  selectCoverageEntries,
  selectDiagnosisCards,
  selectGuidedFlows,
  selectOverviewModel,
  type CoverageEntryRow
} from './overview-selectors'
import './OverviewSection.css'

export function OverviewSection({ onReopenOnboarding }: { onReopenOnboarding?: () => void }) {
  const { config, system, watcher, ui, actions } = useStore()
  const { locale } = useLocale()
  // Modelle ueber memoisierte Selektoren (Teilplan C): Neuberechnung nur bei
  // echten Daten-/Fehler-/Locale-Aenderungen, sonst stabil gleiche Referenz.
  const model = selectOverviewModel(
    config.data, system.data, watcher.data, config.error, system.error, watcher.error, locale
  )
  const diagnosisCards = selectDiagnosisCards(
    config.data, system.data, watcher.data, config.error, system.error, watcher.error, locale
  )
  const flows = selectGuidedFlows(diagnosisCards, locale)
  // Modus-sicher: erste Diagnose-Karte, deren Route im aktiven Modus sichtbar
  // UND erreichbar ist (Experten-Tabs in den Einstellungen zaehlen im Simple-
  // Modus als totes Ziel). WP3: Die KARTEN selbst leben in der eigenen
  // Sidebar-Kategorie „Diagnose“ (Config-Sektion); hier bleibt nur die
  // NextAction plus eine einzeilige Zusammenfassung mit Link dorthin.
  const nextCard = pickNextDiagnosisCard(diagnosisCards, ui.displayMode)
  const nextAction = nextCard?.diagnosisAction ?? model.nextAction
  const coverageRows = selectCoverageEntries(config.data)
  const ack = useCoverageAck()
  const onOpenDiagnosis = useCallback(() => {
    actions.setSearch('')
    actions.setCatId(DIAGNOSIS_CAT_ID)
    actions.setMode('overview')
    actions.setSection('config')
  }, [actions])
  return (
    <main className="main ov-main">
      <OverviewHead />
      <OverviewModeContent
        displayMode={ui.displayMode}
        model={model}
        diagnosisCount={diagnosisCards.length}
        coverageRows={coverageRows}
        flows={flows}
        nextAction={nextAction}
        onOpen={actions.setSection}
        onOpenDiagnosis={onOpenDiagnosis}
        onAck={ack.onAck}
        ackDisabled={ack.ackDisabled}
        onReopenOnboarding={onReopenOnboarding}
      />
    </main>
  )
}

// „So lassen" (E-WP3 L1): Ack-Key an den gated Main-Handler; Erfolg -> Rescan
// via reloadConfig (liefert 'acknowledged'), Fehler -> Warn-Toast. Ohne
// Schreibmodus bleibt der Button disabled (Hinweistext im Register).
function useCoverageAck() {
  const { actions } = useStore()
  const { writeEnabled } = useWriteConfig()
  const onAck = useCallback(
    async (row: CoverageEntryRow) => {
      const bridge = window.electronAPI
      const res = bridge ? await bridge.writeCoverageAck({ key: row.key }) : null
      if (!res || res.error || !res.data) {
        actions.showToast(msg('coverage.action.ackError'), 'warn')
        return
      }
      actions.reloadConfig()
    },
    [actions]
  )
  return { onAck, ackDisabled: !writeEnabled }
}

// Verbindliche Zonen-Reihenfolge (Teilplan E, Owner-Entscheid D1-D3 vom
// 2026-07-18): Stand -> eine sichere Aktion -> Diagnose-Einstieg (WP3: nur
// noch einzeilige Zusammenfassung mit Link in die eigene Sidebar-Kategorie,
// die Karten selbst sind umgezogen) -> Coverage-Register (nur Experten;
// Simple bekommt die Bestaetigt-Zeile) -> Bereichswege (GuidedFlows +
// TaskGrid als eine Zone, in beiden Modi).
function OverviewModeContent(props: {
  displayMode: 'simple' | 'expert'
  model: OverviewModel
  diagnosisCount: number
  coverageRows: CoverageEntryRow[]
  flows: GuidedFlow[]
  nextAction: OverviewNavigationAction
  onOpen(section: Section): void
  onOpenDiagnosis(): void
  onAck(row: CoverageEntryRow): void
  ackDisabled: boolean
  onReopenOnboarding?: () => void
}) {
  const acknowledgedCount = props.coverageRows.filter((row) => row.entry.status === 'acknowledged').length
  return (
    <>
      <section className="ov-zone ov-zone-status">
        <OverviewStatus
          summary={props.model.statusSummary}
          readiness={props.model.readiness}
          openCount={props.model.openCount}
          displayMode={props.displayMode}
        />
      </section>
      <NextAction action={props.nextAction} onOpen={props.onOpen} />
      <DiagnosisSummary count={props.diagnosisCount} onOpen={props.onOpenDiagnosis} />
      {props.displayMode === 'simple' && <CoverageAckLine count={acknowledgedCount} />}
      {props.displayMode === 'expert' && <CoverageRegister
        rows={props.coverageRows}
        displayMode={props.displayMode}
        onAck={props.onAck}
        ackDisabled={props.ackDisabled}
        ackDisabledReason={msg('coverage.action.ackDisabled')}
      />}
      <section className="ov-zone ov-zone-paths" aria-label={msg('overview.zone.areaPaths')}>
        <GuidedFlows flows={props.flows} onOpen={props.onOpen} onReopenOnboarding={props.onReopenOnboarding} />
        <TaskGrid tasks={props.model.tasks} displayMode={props.displayMode} onOpen={props.onOpen} />
      </section>
    </>
  )
}

// WP3: Einzeiliger Einstieg statt Kartenblock — die dauerhaften Karten
// liegen in der Sidebar-Kategorie „Diagnose“. Bei null offenen Hinweisen
// zeigt der Stempel den ruhigen Zustand bereits, die Zeile entfaellt.
function DiagnosisSummary({ count, onOpen }: { count: number; onOpen(): void }) {
  if (count <= 0) return null
  const label = count === 1
    ? msg('diagnostics.summary.link.one')
    : msg('diagnostics.summary.link', { count: String(count) })
  return (
    <section className="ov-diagsummary" aria-label={msg('diagnostics.nav.label')}>
      <button type="button" className="btn ghost ov-diagsummary-link" onClick={onOpen}>
        {Icon.arrow}
        {label}
      </button>
    </section>
  )
}

function OverviewHead() {
  // Teilplan F: optimistischer Umschalter — on sofort, Re-Render als Transition.
  const { active, onSelect } = useDisplayModeSwitch()
  return (
    <div className="ov-head">
      <div className="ov-mark">{Icon.sparkle}</div>
      <div>
        <h1>{msg('overview.title')}</h1>
      </div>
      <DisplayModeSwitch active={active} onSelect={onSelect} />
    </div>
  )
}

// D2 (F-WP2d): Zustands-Stempel als Zentrum oben; Zaehlung ist der echte
// offene Zaehler aus buildOverviewModel (openCount = Warnungen + nicht
// verbundene Bereiche — Coverage-Info-Eintraege und userglobal-Klone sind
// bereits herausgerechnet). Darunter schlichte Readiness-Registerzeilen
// (experten-only, wie zuvor der MetricStrip).
function OverviewStatus(props: {
  summary: string
  readiness: OverviewReadiness[]
  openCount: number
  displayMode: 'simple' | 'expert'
}) {
  return (
    <section className="ov-status" aria-label={props.summary}>
      <StatusStamp openCount={props.openCount} />
      <p className="ov-status-summary">{props.summary}</p>
      {props.displayMode === 'expert' && <ReadinessRows rows={props.readiness} />}
    </section>
  )
}

function ReadinessRows({ rows }: { rows: OverviewReadiness[] }) {
  return (
    <div className="ov-reg ov-readiness">
      {rows.map((row) => (
        <div className="ov-readiness-row" key={row.id}>
          <span className={'ov-dot ' + readinessDotTone(row.tone)} aria-hidden="true" />
          <span className="ov-readiness-name">{row.name}</span>
          <span className="ov-readiness-state">{row.state}</span>
        </div>
      ))}
    </div>
  )
}

function readinessDotTone(tone: OverviewTone): 'ok' | 'open' {
  return tone === 'ready' ? 'ok' : 'open'
}

function NextAction({ action, onOpen }: { action: OverviewNavigationAction; onOpen(section: Section): void }) {
  return (
    <section className="ov-next" aria-label={action.label}>
      <p>{action.reason}</p>
      <button type="button" className="btn primary" onClick={() => navigateToOverviewAction(action, onOpen)}>
        {Icon.arrow}
        {action.label}
      </button>
    </section>
  )
}

function TaskGrid(props: { tasks: OverviewTask[]; displayMode: 'simple' | 'expert'; onOpen(section: Section): void }) {
  const tasks = props.tasks.filter((task) => !task.primary && (props.displayMode === 'expert' || task.id !== 'expert'))
  return (
    <section className="ov-tasks ov-reg">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} displayMode={props.displayMode} onOpen={props.onOpen} />
      ))}
    </section>
  )
}
