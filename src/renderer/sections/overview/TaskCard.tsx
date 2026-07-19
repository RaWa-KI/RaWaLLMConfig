import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { DisplayMode, Section } from '../../state/types'
import type { OverviewTask } from './overview-model'
import { navigateToOverviewAction } from './overview-navigation'

// Bereichs-Navigation als Registerzeile (F-WP2d D3): neutraler Punkt links,
// Titel + eine Kurzzeile, Status rechts, Chevron — keine Nav-Karten mehr.
// Experten-Details bleiben im Experten-Modus unter der Kurzzeile sichtbar.
interface TaskCardProps {
  task: OverviewTask
  displayMode: DisplayMode
  onOpen(section: Section): void
}

export function TaskCard({ task, displayMode, onOpen }: TaskCardProps) {
  return (
    <button
      type="button"
      className={'ov-task' + (task.primary ? ' primary' : '')}
      onClick={() => navigateToOverviewAction(task.nextAction, onOpen)}
    >
      <span className="ov-dot idle" aria-hidden="true" />
      <span className="ov-task-copy">
        <span className="ov-task-title">{task.title}</span>
        <span className="ov-task-body">{task.body}</span>
        {displayMode === 'expert' && <ExpertDetails task={task} />}
      </span>
      <span className="ov-task-state">{msg('tasks.card.status', { status: task.status })}</span>
      <span className="ov-task-arrow" aria-hidden="true">{Icon.chev}</span>
    </button>
  )
}

function ExpertDetails({ task }: { task: OverviewTask }) {
  return (
    <span className="ov-task-expert">
      <span>{msg('expertDetails.primaryTerm', { term: task.primaryTerm })}</span>
      <span>{msg('expertDetails.meaning', { meaning: task.meaning })}</span>
      <span>{msg('expertDetails.technicalName', { term: task.expertTarget })}</span>
      <span>{msg('expertDetails.rawTarget', { target: task.target })}</span>
    </span>
  )
}
