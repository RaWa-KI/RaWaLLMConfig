import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { DisplayMode, Section } from '../../state/types'
import type { OverviewTask } from './overview-model'
import { navigateToOverviewAction } from './overview-navigation'

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
      <span className="ov-task-icon">{Icon[task.icon]}</span>
      <span className="ov-task-copy">
        <span className="ov-task-title">{task.title}</span>
        <span className="ov-task-body">{task.body}</span>
        <span className="ov-task-meaning">{task.meaning}</span>
        <span className="ov-task-status">{msg('tasks.card.status', { status: task.status })}</span>
        {displayMode === 'expert' && <ExpertDetails task={task} />}
      </span>
      <span className="ov-task-arrow">{Icon.chev}</span>
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
