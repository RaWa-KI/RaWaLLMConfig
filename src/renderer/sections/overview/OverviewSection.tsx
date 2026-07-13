import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { useStore } from '../../state/store'
import type { Section } from '../../state/types'
import { DiagnosisCards } from './DiagnosisCards'
import { GuidedFlows } from './GuidedFlows'
import { TaskCard } from './TaskCard'
import { buildDiagnosisCards } from './diagnosis-model'
import { buildGuidedFlows } from './guided-flows-model'
import { buildOverviewModel, type OverviewMetric, type OverviewTask } from './overview-model'
import { navigateToOverviewAction, type OverviewNavigationAction } from './overview-navigation'
import './OverviewSection.css'

export function OverviewSection() {
  const { config, system, watcher, ui, actions } = useStore()
  const model = buildOverviewModel({
    config: config.data,
    system: system.data,
    watcher: watcher.data,
    errors: [config.error, system.error, watcher.error]
  })
  const diagnosisCards = buildDiagnosisCards({
    config: config.data,
    system: system.data,
    watcher: watcher.data,
    errors: [config.error, system.error, watcher.error]
  })
  const flows = buildGuidedFlows(diagnosisCards)
  const nextAction = diagnosisCards[0]?.diagnosisAction ?? model.nextAction
  return (
    <main className="main ov-main">
      <OverviewHead />
      <OverviewModeContent
        displayMode={ui.displayMode}
        model={model}
        diagnosisCards={diagnosisCards}
        flows={flows}
        nextAction={nextAction}
        onOpen={actions.setSection}
      />
    </main>
  )
}

function OverviewModeContent(props: {
  displayMode: 'simple' | 'expert'
  model: ReturnType<typeof buildOverviewModel>
  diagnosisCards: ReturnType<typeof buildDiagnosisCards>
  flows: ReturnType<typeof buildGuidedFlows>
  nextAction: OverviewNavigationAction
  onOpen(section: Section): void
}) {
  if (props.displayMode === 'expert') return <ExpertOverview {...props} />
  return <SimpleOverview {...props} />
}

function SimpleOverview(props: OverviewModeContentProps) {
  return (
    <>
      <NextAction action={props.nextAction} onOpen={props.onOpen} />
      <GuidedFlows flows={props.flows} onOpen={props.onOpen} />
      <TaskGrid tasks={props.model.tasks} displayMode="simple" onOpen={props.onOpen} />
      <OverviewStatus summary={props.model.statusSummary} metrics={props.model.metrics} />
      <DiagnosisCards cards={props.diagnosisCards} displayMode="simple" onOpen={props.onOpen} />
    </>
  )
}

function ExpertOverview(props: OverviewModeContentProps) {
  return (
    <>
      <OverviewStatus summary={props.model.statusSummary} metrics={props.model.metrics} />
      <DiagnosisCards cards={props.diagnosisCards} displayMode="expert" onOpen={props.onOpen} />
      <TaskGrid tasks={props.model.tasks} displayMode="expert" onOpen={props.onOpen} />
      <GuidedFlows flows={props.flows} onOpen={props.onOpen} />
      <NextAction action={props.nextAction} onOpen={props.onOpen} />
    </>
  )
}

type OverviewModeContentProps = Omit<Parameters<typeof OverviewModeContent>[0], 'displayMode'>

function OverviewHead() {
  return (
    <div className="ov-head">
      <div className="ov-mark">{Icon.sparkle}</div>
      <div>
        <h1>{msg('overview.title')}</h1>
      </div>
    </div>
  )
}

function OverviewStatus({ summary, metrics }: { summary: string; metrics: OverviewMetric[] }) {
  return (
    <section className="ov-status" aria-label={summary}>
      <p>{summary}</p>
      <MetricStrip metrics={metrics.filter((metric) => metric.id !== 'overall')} />
    </section>
  )
}

function MetricStrip({ metrics }: { metrics: OverviewMetric[] }) {
  return (
    <div className="ov-metrics">
      {metrics.map((metric) => (
        <div className={'ov-metric ' + metric.tone} key={metric.id}>
          <span>{Icon[metric.icon]}</span>
          <b>{metric.text}</b>
        </div>
      ))}
    </div>
  )
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
    <section className="ov-tasks">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} displayMode={props.displayMode} onOpen={props.onOpen} />
      ))}
    </section>
  )
}
