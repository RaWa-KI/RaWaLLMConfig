import type { AppData, System, Watcher } from '@shared/contract'
import { isCoverageInfoEntry } from '@shared/entry-attention'
import { msg, msgText, type MessageKey } from '../../lib/messages'
import type { Section } from '../../state/types'
import type { OverviewNavigationAction } from './overview-navigation'

export type OverviewTone = 'ready' | 'incomplete' | 'warning'

export interface OverviewMetric {
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
  status: string
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

interface AreaState {
  tone: OverviewTone
  warnings: number
  topic: string
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
    tasks: makeTasks(warningCount, incompleteCount),
    nextAction: fallbackNextAction(warningCount, incompleteCount)
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
  const entryWarnings = entries.filter((item) => (
    item.entry.status !== 'active' && !isCoverageInfoEntry(item.entry, item.familyId)
  )).length
  const warnings = scanErrors + duplicateCount + entryWarnings
  if (entries.length === 0) return { tone: 'incomplete', warnings, topic }
  return { tone: warnings > 0 ? 'warning' : 'ready', warnings, topic }
}

function systemState(system: System | null): AreaState {
  const topic = msg('overview.topic.system')
  if (!system) return { tone: 'incomplete', warnings: 0, topic }
  const entries = system.areas.flatMap((area) => area.entries)
  const warnings = entries.filter((entry) => entry.status !== 'active').length
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

function readinessState(state: AreaState): string {
  if (state.tone === 'ready') return msg('overview.readiness.state.ready')
  if (state.tone === 'incomplete') return msg('overview.readiness.state.incomplete')
  return msg('overview.readiness.state.warning', { count: String(state.warnings) })
}

export function warningSummary(topicCount: number): string {
  if (topicCount <= 1) return msg('overview.warningSummary.one')
  return msg('overview.warningSummary.many', { topicCount: String(topicCount) })
}

function makeTasks(warningCount: number, incompleteCount: number): OverviewTask[] {
  const primary = primaryTask(warningCount, incompleteCount)
  return taskDefinitions().map((task) => ({ ...task, primary: task.id === primary }))
}

function fallbackNextAction(warningCount: number, incompleteCount: number): OverviewNavigationAction {
  const primaryId = primaryTask(warningCount, incompleteCount)
  return taskDefinitions().find((taskItem) => taskItem.id === primaryId)?.nextAction ?? taskDefinitions()[0].nextAction
}

function primaryTask(warningCount: number, incompleteCount: number): OverviewTask['id'] {
  if (incompleteCount > 0) return 'setup'
  if (warningCount > 0) return 'check'
  return 'change'
}

function taskDefinitions(): OverviewTask[] {
  return [
    task('setup', 'tasks.setup', 'plug', 'settings', msg('diagnostics.status.notConfigured')),
    task('check', 'tasks.check', 'refresh', 'updates', msg('diagnostics.status.problemFound')),
    task('change', 'tasks.change', 'edit', 'config', msg('simpleMode.backupHint')),
    task('restore', 'tasks.restore', 'snap', 'archiv', msg('simpleMode.backupHint')),
    task('expert', 'tasks.expert', 'book', 'referenz', msg('expertDetails.label'))
  ]
}

function task(
  id: OverviewTask['id'],
  keyPrefix: 'tasks.setup' | 'tasks.check' | 'tasks.change' | 'tasks.restore' | 'tasks.expert',
  icon: string,
  target: Section,
  status: string
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
    status,
    primary: false,
    nextAction: {
      label: title,
      reason: meaning,
      route: target,
      targetDescription: expertTarget
    }
  }
}
