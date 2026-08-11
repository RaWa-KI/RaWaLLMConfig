import type { AppData, System, Watcher } from '@shared/contract'
import { isCoverageInfoEntry } from '@shared/entry-attention'
import { msg, msgText, type MessageKey } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { OverviewNavigationAction } from './overview-navigation'
import { readinessState, taskMarks, type AreaState, type TaskMark, type TaskMarks } from './overview-task-marks'

export type OverviewTone = 'ready' | 'incomplete' | 'warning'

interface OverviewMetric {
  id: string
  tone: OverviewTone
  icon: string
  text: string
}

export interface OverviewTask {
  id: 'setup' | 'check' | 'change' | 'restore' | 'expert'
  title: string
  body: string
  primaryTerm: string
  meaning: string
  expertTarget: string
  // Kurzstatus rechts auf der Kachel — kommt aus dem ECHTEN Bereichszustand
  // (configState/readinessState), nicht mehr aus einem festen Text.
  status: string
  // Laienverstaendlicher Grund ("fehlt: …" / "offen: …"). Leer, wenn alles
  // bereit ist — dann steht auf der Kachel bewusst kein Grund.
  reason: string
  icon: string
  target: Section
  primary: boolean
  nextAction: OverviewNavigationAction
}

// Readiness-Zeile (F-WP2d D2): ein Grundbereich als schlichte Registerzeile
// (Status-Punkt + Name + Kurzstatus rechts) — ersetzt die MetricStrip-Karten.
export interface OverviewReadiness {
  id: 'config' | 'system' | 'watcher'
  tone: OverviewTone
  name: string
  state: string
}

export interface OverviewModel {
  readyCount: number
  totalCount: number
  warningCount: number
  warningTopicCount: number
  warningTopics: string[]
  incompleteCount: number
  openCount: number
  statusSummary: string
  metrics: OverviewMetric[]
  readiness: OverviewReadiness[]
  tasks: OverviewTask[]
  nextAction: OverviewNavigationAction
}

export function buildOverviewModel(data: {
  config: AppData | null
  system: System | null
  watcher: Watcher | null
  errors: readonly (string | null)[]
}): OverviewModel {
  const states = [configState(data.config), systemState(data.system), watcherState(data.watcher)]
  const warningCount = states.reduce((sum, state) => sum + state.warnings, countErrors(data.errors))
  const warningTopics = listWarningTopics(states, data.errors)
  const warningTopicCount = warningTopics.length
  const readyCount = states.filter((state) => state.tone === 'ready').length
  const incompleteCount = states.filter((state) => state.tone === 'incomplete').length
  const tasks = makeTasks(states, warningTopics, warningCount, incompleteCount)
  return {
    readyCount,
    totalCount: states.length,
    warningCount,
    warningTopicCount,
    warningTopics,
    incompleteCount,
    // Echte offene Punkte fuer den Zustands-Stempel (F-WP2d D2): Warnungen
    // (Coverage-Info/userglobal-Klone bereits herausgerechnet) + nicht
    // verbundene Grundbereiche. KEINE Gesamtdifferenz aus dem Ordner-Scan.
    openCount: warningCount + incompleteCount,
    statusSummary: readinessSummary(readyCount, states.length, warningTopicCount, incompleteCount),
    metrics: makeMetrics(readyCount, states.length, warningTopics, incompleteCount),
    readiness: makeReadiness(states),
    tasks,
    nextAction: fallbackNextAction(tasks, warningCount, incompleteCount)
  }
}

function configState(config: AppData | null): AreaState {
  const topic = msg('overview.topic.config')
  if (!config) return { tone: 'incomplete', warnings: 0, topic }
  const familyPairs = Object.entries(config.data)
    .filter(([familyId]) => familyId !== 'userglobal')
  const entries = familyPairs.flatMap(([familyId, family]) =>
    family.categories.flatMap((cat) => cat.entries.map((entry) => ({ familyId, entry }))))
  const scanErrors = config.llms.filter((llm) => llm.scanError).length
  const duplicateCount = familyPairs.reduce((sum, [, family]) => sum + family.duplicates.length, 0)
  // Warn-Zaehler nutzt DIESELBE Wahrheit wie die Diagnosekarten (B3/WP1):
  // Katalog-/Endpoint-/Key-Eintraege (fileBacked === false = „Katalog/nicht
  // geprueft") sind per Design keine Fehler und duerfen den Stempel nicht
  // aufblahen — ein Laie las sonst beim ersten Start Dutzende Phantom-
  // Warnungen (Baseline 2026-07-28: „17 Dinge ansehen" bei gesundem System).
  const entryWarnings = entries.filter((item) => (
    item.entry.status !== 'active'
    && item.entry.fileBacked !== false
    && !isCoverageInfoEntry(item.entry, item.familyId)
  )).length
  const warnings = scanErrors + duplicateCount + entryWarnings
  if (entries.length === 0) return { tone: 'incomplete', warnings, topic }
  return { tone: warnings > 0 ? 'warning' : 'ready', warnings, topic }
}

function systemState(system: System | null): AreaState {
  const topic = msg('overview.topic.system')
  if (!system) return { tone: 'incomplete', warnings: 0, topic }
  const entries = system.areas.flatMap((area) => area.entries)
  // WP2: Registry-/Katalog-Eintraege (fileBacked === false) sind Zusatzinfo
  // und zaehlen nicht als Warnung — dieselbe Wahrheit wie die Karten.
  const warnings = entries.filter((entry) => entry.status !== 'active' && entry.fileBacked !== false).length
  if (entries.length === 0) return { tone: 'incomplete', warnings, topic }
  return { tone: warnings > 0 ? 'warning' : 'ready', warnings, topic }
}

function watcherState(watcher: Watcher | null): AreaState {
  const topic = msg('overview.topic.watcher')
  if (!watcher) return { tone: 'incomplete', warnings: 0, topic }
  const warnings = watcher.sources.filter((source) => source.state !== 'current').length
  if (watcher.sources.length === 0) return { tone: 'incomplete', warnings, topic }
  return { tone: warnings > 0 ? 'warning' : 'ready', warnings, topic }
}

function countErrors(errors: readonly (string | null)[]): number {
  return errors.filter(Boolean).length
}

function listWarningTopics(states: AreaState[], errors: readonly (string | null)[]): string[] {
  const topics = states
    .filter((state) => state.warnings > 0)
    .map((state) => state.topic)
  return countErrors(errors) > 0 ? [...topics, msg('overview.topic.appErrors')] : topics
}

function readinessSummary(readyCount: number, totalCount: number, warningTopicCount: number, incompleteCount: number): string {
  if (warningTopicCount > 0) return msg('overview.status.partial', { readyCount: String(readyCount), totalCount: String(totalCount) })
  if (incompleteCount > 0) return msg('overview.status.incomplete', { readyCount: String(readyCount), totalCount: String(totalCount) })
  return msg('overview.status.ready', { totalCount: String(totalCount) })
}

function makeMetrics(readyCount: number, totalCount: number, warningTopics: string[], incompleteCount: number): OverviewMetric[] {
  const topicText = warningTopics.length > 0
    ? msg('overview.metric.openTopics.some', { topics: warningTopics.join(', ') })
    : msg('overview.metric.openTopics.none')
  const setupText = incompleteCount > 0
    ? msg('overview.metric.setup.needed', { count: String(incompleteCount), total: String(totalCount) })
    : msg('overview.metric.setup.ready')
  return [
    {
      id: 'overall',
      tone: warningTopics.length > 0 ? 'warning' : incompleteCount > 0 ? 'incomplete' : 'ready',
      icon: warningTopics.length > 0 ? 'warn' : 'check',
      text: readinessSummary(readyCount, totalCount, warningTopics.length, incompleteCount)
    },
    {
      id: 'open-topics',
      tone: warningTopics.length > 0 ? 'warning' : 'ready',
      icon: warningTopics.length > 0 ? 'warn' : 'check',
      text: topicText
    },
    {
      id: 'setup',
      tone: incompleteCount > 0 ? 'incomplete' : 'ready',
      icon: 'plug',
      text: setupText
    }
  ]
}

function makeReadiness(states: readonly AreaState[]): OverviewReadiness[] {
  // states liegen in fester Reihenfolge vor: config, system, watcher.
  const ids = ['config', 'system', 'watcher'] as const
  return states.map((state, index) => ({
    id: ids[index],
    tone: state.tone,
    name: state.topic,
    state: readinessState(state)
  }))
}

function makeTasks(
  states: readonly AreaState[],
  warningTopics: readonly string[],
  warningCount: number,
  incompleteCount: number
): OverviewTask[] {
  const primary = primaryTask(warningCount, incompleteCount)
  const marks = taskMarks(states, warningTopics, warningCount, incompleteCount)
  return taskDefinitions(marks).map((task) => ({ ...task, primary: task.id === primary }))
}

function fallbackNextAction(
  tasks: readonly OverviewTask[],
  warningCount: number,
  incompleteCount: number
): OverviewNavigationAction {
  const primaryId = primaryTask(warningCount, incompleteCount)
  return tasks.find((taskItem) => taskItem.id === primaryId)?.nextAction ?? tasks[0].nextAction
}

function primaryTask(warningCount: number, incompleteCount: number): OverviewTask['id'] {
  if (incompleteCount > 0) return 'setup'
  if (warningCount > 0) return 'check'
  return 'change'
}

// Die Kacheln bekommen ihren Status/Grund jetzt aus marks (echter Zustand),
// nicht mehr aus einem festen Text.
function taskDefinitions(marks: TaskMarks): OverviewTask[] {
  return [
    task('setup', 'tasks.setup', 'plug', 'settings', marks.setup),
    task('check', 'tasks.check', 'refresh', 'updates', marks.check),
    task('change', 'tasks.change', 'edit', 'config', marks.change),
    task('restore', 'tasks.restore', 'snap', 'archiv', marks.restore),
    task('expert', 'tasks.expert', 'book', 'referenz', marks.expert)
  ]
}

function task(
  id: OverviewTask['id'],
  keyPrefix: 'tasks.setup' | 'tasks.check' | 'tasks.change' | 'tasks.restore' | 'tasks.expert',
  icon: string,
  target: Section,
  mark: TaskMark
): OverviewTask {
  const title = msgText(`${keyPrefix}.title` as MessageKey)
  const meaning = msgText(`${keyPrefix}.meaning` as MessageKey)
  const expertTarget = msgText(`${keyPrefix}.expertTarget` as MessageKey)
  return {
    id,
    title,
    body: msgText(`${keyPrefix}.body` as MessageKey),
    primaryTerm: msgText(`${keyPrefix}.term` as MessageKey),
    meaning,
    expertTarget,
    icon,
    target,
    status: mark.status,
    reason: mark.reason,
    primary: false,
    nextAction: {
      label: title,
      reason: meaning,
      route: target,
      targetDescription: expertTarget
    }
  }
}
