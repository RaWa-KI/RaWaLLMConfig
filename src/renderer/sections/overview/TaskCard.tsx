import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { DisplayMode, Section } from '../../state/types'
import type { OverviewTask } from './overview-model'
import { navigateToOverviewAction } from './overview-navigation'

// Bereichs-Navigation als Registerzeile (F-WP2d D3): neutraler Punkt links,
// Titel + eine Kurzzeile, Status rechts, Chevron — keine Nav-Karten mehr.
// Experten-Details (F16, 2026-08-07): by design ZUGEKLAPPT und auf Begriff +
// Ziel reduziert; die Laien-Benennung ist kein Experten-Detail (Owner-Vorgabe).
// Aussen div role=button statt <button>, damit <details> legal verschachtelt ist.
interface TaskCardProps {
  task: OverviewTask
  displayMode: DisplayMode
  onOpen(section: Section): void
}

export function TaskCard({ task, displayMode, onOpen }: TaskCardProps) {
  const open = () => navigateToOverviewAction(task.nextAction, onOpen)
  return (
    <div
      role="button"
      tabIndex={0}
      className={'ov-task' + (task.primary ? ' primary' : '')}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
    >
      <span className="ov-dot idle" aria-hidden="true" />
      <span className="ov-task-copy">
        <span className="ov-task-title">{task.title}</span>
        <span className="ov-task-body">{task.body}</span>
        {/* Grund nur zeigen, wenn wirklich etwas offen ist (WP-4). */}
        {/* erbt bewusst ov-task-body: keine neue CSS-Regel noetig */}
        {task.reason !== '' && <span className="ov-task-body ov-task-reason">{task.reason}</span>}
        {displayMode === 'expert' && <ExpertDetails task={task} />}
      </span>
      <span className="ov-task-state">{msg('tasks.card.status', { status: task.status })}</span>
      <span className="ov-task-arrow" aria-hidden="true">{Icon.chev}</span>
    </div>
  )
}

function ExpertDetails({ task }: { task: OverviewTask }) {
  return (
    <details
      className="ov-task-expert-toggle"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <summary>{msg('expertDetails.rawDetails')}</summary>
      <span className="ov-task-expert">
        <span>{msg('expertDetails.technicalName', { term: task.expertTarget })}</span>
        <span>{msg('expertDetails.rawTarget', { target: task.target })}</span>
      </span>
    </details>
  )
}
