import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { DisplayMode, Section } from '../../state/types'
import type { DiagnosisCard } from './diagnosis-model'
import { navigateToOverviewAction } from './overview-navigation'
import './DiagnosisCards.css'

interface DiagnosisCardsProps {
  cards: DiagnosisCard[]
  displayMode: DisplayMode
  onOpen(section: Section): void
}

export function DiagnosisCards({ cards, displayMode, onOpen }: DiagnosisCardsProps) {
  if (cards.length === 0) return null
  const visibleCards = cards.slice(0, 6)
  const hiddenCount = Math.max(0, cards.length - visibleCards.length)
  return (
    <section className="ov-diagnostics" aria-labelledby="diagnostics-title">
      <div className="ov-diagnostics-head">
        <h2 id="diagnostics-title">{msg('diagnostics.panel.title')}</h2>
        <p>{msg('diagnostics.panel.intro')}</p>
      </div>
      <div className="ov-diagnostics-grid">
        {visibleCards.map((card) => (
          <DiagnosisCardView key={card.id} card={card} displayMode={displayMode} onOpen={onOpen} />
        ))}
      </div>
      {hiddenCount > 0 && <p className="ov-diagnostics-more">{msg('diagnostics.panel.more', { hiddenCount: String(hiddenCount) })}</p>}
    </section>
  )
}

function DiagnosisCardView(props: {
  card: DiagnosisCard
  displayMode: DisplayMode
  onOpen(section: Section): void
}) {
  return (
    <article className={'ov-diagnosis ' + props.card.severityTone}>
      <div className="ov-diagnosis-top">
        <span className="ov-diagnosis-icon">{Icon.warn}</span>
        <span className="ov-diagnosis-severity">{props.card.severity}</span>
      </div>
      <h3>{props.card.title}</h3>
      <p>{msg('diagnostics.card.summary', { status: props.card.status })}</p>
      <p>{msg('diagnostics.card.meaning', { issue: props.card.meaning })}</p>
      {props.displayMode === 'expert' && <DiagnosisNextSteps card={props.card} />}
      <button type="button" className="btn ghost" onClick={() => navigateToOverviewAction(props.card.diagnosisAction, props.onOpen)}>
        {Icon.arrow}
        {props.displayMode === 'simple' ? props.card.action : props.card.diagnosisAction.label}
      </button>
      {props.displayMode === 'expert' && <DiagnosisDetails details={props.card.details} action={props.card.diagnosisAction} />}
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
