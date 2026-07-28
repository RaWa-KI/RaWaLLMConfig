// overview-task-marks.ts — Kachel-Zustand der Startseite (WP-4).
// HR27-Split aus overview-model.ts: hier liegt ausschliesslich die Frage
// "welchen Status und welchen Grund zeigt eine Kachel?". Datenquelle sind
// allein die vorhandenen Bereichszustaende (configState/systemState/
// watcherState) und die daraus gebildeten Warnthemen — keine neue Quelle.
import { msg } from '../../lib/messages'
import type { OverviewTask, OverviewTone } from './overview-model'

export interface AreaState {
  tone: OverviewTone
  warnings: number
  topic: string
}

export interface TaskMark {
  status: string
  reason: string
}

export type TaskMarks = Record<OverviewTask['id'], TaskMark>

// Kurzstatus eines Grundbereichs — dieselbe Formulierung wie in der
// Readiness-Registerzeile, damit Kachel und Statusstempel nie widersprechen.
export function readinessState(state: AreaState): string {
  if (state.tone === 'ready') return msg('overview.readiness.state.ready')
  if (state.tone === 'incomplete') return msg('overview.readiness.state.incomplete')
  return msg('overview.readiness.state.warning', { count: String(state.warnings) })
}

export function taskMarks(
  states: readonly AreaState[],
  warningTopics: readonly string[],
  warningCount: number,
  incompleteCount: number
): TaskMarks {
  const missingTopics = states.filter((state) => state.tone === 'incomplete').map((state) => state.topic)
  const setupTone: OverviewTone = incompleteCount > 0 ? 'incomplete' : 'ready'
  const checkTone: OverviewTone = warningCount > 0 ? 'warning' : 'ready'
  // Aendern und Wiederherstellen haengen am Config-Bereich (states[0]).
  const configMark = areaMark(states[0])
  return {
    setup: {
      status: readinessState({ tone: setupTone, warnings: 0, topic: '' }),
      reason: missingTopics.length > 0 ? missingReason(missingTopics) : ''
    },
    check: {
      status: readinessState({ tone: checkTone, warnings: warningCount, topic: '' }),
      reason: warningTopics.length > 0 ? openReason(warningTopics) : ''
    },
    change: configMark,
    restore: configMark,
    expert: { status: msg('tasks.status.available'), reason: '' }
  }
}

function areaMark(state: AreaState): TaskMark {
  const status = readinessState(state)
  if (state.tone === 'incomplete') return { status, reason: missingReason([state.topic]) }
  if (state.tone === 'warning') return { status, reason: openReason([state.topic]) }
  return { status, reason: '' }
}

function missingReason(topics: readonly string[]): string {
  return msg('tasks.card.missing', { topics: topics.join(', ') })
}

function openReason(topics: readonly string[]): string {
  return msg('tasks.card.open', { topics: topics.join(', ') })
}
