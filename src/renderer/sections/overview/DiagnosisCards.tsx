import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { isExpertOnlySection } from '../../state/section-visibility'
import type { DisplayMode, Section } from '../../state/types'
import type { DiagnosisCard } from './diagnosis-model'
import { navigateToOverviewAction, type OverviewNavigationAction } from './overview-navigation'
import './DiagnosisCards.css'

// Diagnosezeilen (Teilplan E + F-WP2d D3): nur echte offene Befunde, jetzt als
// Registerzeilen (Status-Punkt, Titel, Kurzzeile, Aktion rechts, Aufklapp-
// Chevron) statt Tint-Karten. Die Coverage-Liste lebt seit E-WP1a als eigene
// Zone in CoverageRegister.tsx; die einfache Ansicht bekommt stattdessen die
// Bestaetigt-Zeile (CoverageAckLine). Deckelung (PAGE_SIZE) bleibt unveraendert;
// aufgeklappt zeigen sich Zustand, Experten-Naechste-Schritte und Rohdetails.

interface DiagnosisCardsProps {
  cards: DiagnosisCard[]
  displayMode: DisplayMode
  onOpen(section: Section): void
  onOpenExpert(action: OverviewNavigationAction): void
}

const PAGE_SIZE = 8

export function DiagnosisCards({ cards, displayMode, onOpen, onOpenExpert }: DiagnosisCardsProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  if (cards.length === 0) return null
  const visibleCards = cards.slice(0, PAGE_SIZE)
  return (
    <section className="ov-diagnostics" aria-labelledby="diagnostics-title">
      <div className="ov-diagnostics-head">
        <h2 id="diagnostics-title">{msg('diagnostics.panel.title')}</h2>
        <p>{msg('diagnostics.panel.intro')}</p>
      </div>
      <div className="ov-reg ov-diagnostics-rows">
        {visibleCards.map((card) => (
          <DiagnosisRow
            key={card.id}
            card={card}
            displayMode={displayMode}
            expanded={expanded.has(card.id)}
            onToggle={() => setExpanded((current) => toggleExpanded(current, card.id))}
            onOpen={onOpen}
            onOpenExpert={onOpenExpert}
          />
        ))}
      </div>
    </section>
  )
}

function DiagnosisRow(props: {
  card: DiagnosisCard
  displayMode: DisplayMode
  expanded: boolean
  onToggle(): void
  onOpen(section: Section): void
  onOpenExpert(action: OverviewNavigationAction): void
}) {
  // Simple-Modus + Experten-Route: der Button schaltet erst in den
  // Expert-Modus um und navigiert dann (kein stiller Guard = toter Button).
  const expertRoute = props.displayMode === 'simple' && isExpertOnlySection(props.card.diagnosisAction.route)
  return (
    <article className={'ov-diag-row ' + props.card.severityTone}>
      <div className="ov-diag-line">
        <button type="button" className="ov-diag-toggle" aria-expanded={props.expanded} onClick={props.onToggle}>
          <span className="ov-diag-dot" aria-hidden="true" />
          <span className="ov-diag-main">
            <span className="ov-diag-title">{props.card.title}</span>
            <span className="ov-diag-sub">{props.card.meaning}</span>
          </span>
        </button>
        <button
          type="button"
          className="btn ghost ov-diag-action"
          onClick={() => expertRoute ? props.onOpenExpert(props.card.diagnosisAction) : navigateToOverviewAction(props.card.diagnosisAction, props.onOpen)}
        >
          {Icon.arrow}
          {expertRoute ? msg('diagnostics.card.openInExpert') : (props.displayMode === 'simple' ? props.card.action : props.card.diagnosisAction.label)}
        </button>
        <button
          type="button"
          className="ov-diag-chev"
          aria-expanded={props.expanded}
          aria-label={msg('diagnostics.row.toggle')}
          onClick={props.onToggle}
        >
          <span className={props.expanded ? 'ov-diag-chevron expanded' : 'ov-diag-chevron'} aria-hidden="true">{Icon.chev}</span>
        </button>
      </div>
      {props.expanded && <div className="ov-diag-details">
        <p className="ov-diag-state">
          <span className="ov-diag-severity">{props.card.severity}</span>
          {msg('diagnostics.card.summary', { status: props.card.status })}
        </p>
        {props.displayMode === 'expert' && <DiagnosisNextSteps card={props.card} />}
        {props.displayMode === 'expert' && <DiagnosisDetails details={props.card.details} action={props.card.diagnosisAction} />}
      </div>}
    </article>
  )
}

function DiagnosisNextSteps({ card }: { card: DiagnosisCard }) {
  return (
    <dl className="ov-diagnosis-next">
      <div><dt>Wo?</dt><dd>{card.where}</dd></div>
      <div><dt>Was tun?</dt><dd>{card.how}</dd></div>
      <div><dt>Was ändern?</dt><dd>{card.changeHint}</dd></div>
    </dl>
  )
}

function DiagnosisDetails({ details, action }: { details: readonly string[]; action: DiagnosisCard['diagnosisAction'] }) {
  return (
    <div className="ov-diagnosis-details">
      <b>{msg('diagnostics.card.viewDetails')}</b>
      <span>{msg('expertDetails.rawTarget', { target: action.route })}</span>
      <span>{action.focusId ?? action.targetDescription}</span>
      {details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
    </div>
  )
}

function toggleExpanded(current: Set<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
