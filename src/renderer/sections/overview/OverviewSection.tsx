import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { useStore } from '../../state/store'
import type { Section } from '../../state/types'
import { DiagnosisCards } from './DiagnosisCards'
import { GuidedFlows } from './GuidedFlows'
import { TaskCard } from './TaskCard'
import { buildDiagnosisCards } from './diagnosis-model'
import { buildGuidedFlows } from './guided-flows-model'
import { buildOverviewModel, warningSummary, type OverviewMetric, type OverviewTask } from './overview-model'
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
  const simpleMode = ui.displayMode === 'simple'
  return (
    <main className="main ov-main">
      <GuidedFlows flows={flows} onOpen={actions.setSection} />
      <OverviewHead statusSummary={model.statusSummary} warningTopicCount={model.warningTopicCount} />
      <NextAction action={nextAction} onOpen={actions.setSection} />
      <MetricStrip metrics={model.metrics} />
      <DiagnosisCards cards={diagnosisCards} displayMode={ui.displayMode} onOpen={actions.setSection} />
      <TaskGrid tasks={model.tasks} displayMode={ui.displayMode} onOpen={actions.setSection} />
    </main>
  )
}

function OverviewHead(props: { statusSummary: string; warningTopicCount: number }) {
  return (
    <div className="ov-head">
      <div className="ov-mark">{Icon.sparkle}</div>
      <div>
        <h1>{msg('overview.title')}</h1>
        <p>{props.statusSummary}</p>
      </div>
      <div className="ov-head-warn">
        {Icon.warn}
        {warningSummary(props.warningTopicCount)}
      </div>
    </div>
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
    <section className="ov-next">
      <div>
        <h2>{msg('overview.nextAction')}</h2>
        <p>{action.reason}</p>
      </div>
      <button type="button" className="btn primary" onClick={() => navigateToOverviewAction(action, onOpen)}>
        {Icon.arrow}
        {action.label}
      </button>
    </section>
  )
}

function TaskGrid(props: { tasks: OverviewTask[]; displayMode: 'simple' | 'expert'; onOpen(section: Section): void }) {
  const tasks = props.displayMode === 'simple' ? props.tasks.filter((task) => task.id !== 'expert') : props.tasks
  return (
    <section className="ov-tasks">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} displayMode={props.displayMode} onOpen={props.onOpen} />
      ))}
    </section>
  )
}
