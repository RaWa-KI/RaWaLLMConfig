import type { AppData, Category, ConfigEntry, EntryStatus, System, SystemEntry, Watcher } from '@shared/contract'
import { msg } from '../../lib/messages'
import { actionVisibleForMode } from '../../state/section-visibility'
import type { DisplayMode, Section } from '../../state/types'
import {
  changeText, concreteMeaning, configChangeHint, configTargetLabel, familyLabel,
  isMissingKeyEntry, isProblemEntry, missingKeyCopy, unknownTarget, whereText
} from './diagnosis-cards-filter'
import { isOllamaHint, ollamaDiagnosisCopy, ollamaEvidence } from './diagnosis-ollama'
import type { OverviewNavigationAction } from './overview-navigation'

export type DiagnosisStatus = 'notConfigured' | 'notFound' | 'unavailable' | 'paused' | 'problemFound' | 'notUsable'
export type DiagnosisSource = 'config' | 'system' | 'watcher' | 'appErrors'
type DiagnosisSeverity = 'info' | 'warning' | 'error'

export interface DiagnosisCard {
  id: string
  title: string
  status: string
  severity: string
  severityTone: DiagnosisSeverity
  source: DiagnosisSource
  meaning: string
  action: string
  where: string
  how: string
  changeHint: string
  diagnosisAction: OverviewNavigationAction
  target: Section
  details: readonly string[]
  causeKey: string
}

interface DiagnosisInput {
  config: AppData | null
  system: System | null
  watcher: Watcher | null
  errors: readonly (string | null)[]
}

export function buildDiagnosisCards(data: DiagnosisInput): DiagnosisCard[] {
  return sortCards(dedupeCauses([
    ...loadErrorCards(data.errors),
    ...configCards(data.config),
    ...systemCards(data.system, data.config),
    ...watcherCards(data.watcher)
  ]))
}

export function pickNextDiagnosisCard(cards: readonly DiagnosisCard[], mode: DisplayMode): DiagnosisCard | undefined {
  return cards.find((card) => actionVisibleForMode(card.diagnosisAction, mode))
}

function loadErrorCards(errors: readonly (string | null)[]): DiagnosisCard[] {
  return errors.filter(Boolean).map((error, index) => {
    return card(`load-${index}`, 'unavailable', 'error', 'appErrors', 'updates', { detail: error ?? '', focusId: `load-${index}` })
  })
}

function configCards(config: AppData | null): DiagnosisCard[] {
  if (!config) return [card('config-missing', 'notConfigured', 'info', 'config', 'settings')]
  const families = Object.entries(config.data)
  const entries = families.flatMap(([familyId, family]) => {
    return family.categories.flatMap((category) => category.entries.map((entry) => ({ familyId, category, entry })))
  })
  const cards = config.llms
    .filter((llm) => llm.scanError)
    .map((llm) => card(`llm-${llm.id}`, 'notUsable', 'error', 'config', 'config', {
      detail: llm.scanError,
      targetLabel: llm.name,
      focusId: `config-llm-${llm.id}`
    }))
  cards.push(...familyProblemCards(families))

  if (entries.length === 0) cards.push(card('config-empty', 'notFound', 'warning', 'config', 'settings'))
  for (const { familyId, category, entry } of entries) {
    // Einzige bewusste Karte fuer fileBacked === false: fehlender Cloud-Key
    // (einrichtbarer Zustand, Info statt Problem; B3).
    if (isMissingKeyEntry(entry)) {
      cards.push(keyMissingCard(familyId, category, entry, config.llms))
      continue
    }
    if (!isProblemEntry(entry, familyId)) continue
    cards.push(statusCard(`entry-${familyId}-${entry.id}`, entry.status, 'config', 'config', {
      detail: entry.conflictReason ?? entry.path,
      targetLabel: configTargetLabel(category, entry),
      focusId: `config-entry-${familyId}-${entry.id}`,
      meaning: concreteMeaning(entry),
      where: `Ändern > ${familyLabel(config.llms, familyId)} > ${category.label}`,
      how: `Öffne den Eintrag ${entry.name} in ${category.label}.`,
      changeHint: configChangeHint(entry.status, entry.conflictReason, entry.name)
    }))
  }
  return cards
}

// Familien-Level-Befunde: Scan-Fehler und Dubletten-Hinweise je Familie.
function familyProblemCards(families: [string, AppData['data'][string]][]): DiagnosisCard[] {
  const cards: DiagnosisCard[] = []
  for (const [familyId, family] of families) {
    if (family.scanError) {
      cards.push(card(`family-${familyId}`, 'notUsable', 'error', 'config', 'config', {
        detail: family.scanError,
        targetLabel: familyId,
        focusId: `config-family-${familyId}`
      }))
    }
    if (family.duplicates.length > 0) {
      cards.push(card(`duplicate-${familyId}`, 'problemFound', 'warning', 'config', 'config', {
        targetLabel: `${familyId} Dubletten`,
        focusId: `config-duplicates-${familyId}`
      }))
    }
  }
  return cards
}

// Fehlender Cloud-API-Key: Info-Karte mit laienverstaendlichem Text und dem
// Ort, an dem der Key gesetzt wird (B3; Texte aus dem Filter-Modul).
function keyMissingCard(familyId: string, category: Category, entry: ConfigEntry, llms: AppData['llms']): DiagnosisCard {
  return card(`entry-${familyId}-${entry.id}`, 'notConfigured', 'info', 'config', 'config', {
    detail: entry.desc,
    targetLabel: configTargetLabel(category, entry),
    focusId: `config-entry-${familyId}-${entry.id}`,
    ...missingKeyCopy(entry),
    where: `Ändern > ${familyLabel(llms, familyId)} > ${category.label}`
  })
}

function systemCards(system: System | null, config: AppData | null): DiagnosisCard[] {
  if (!system) return [card('system-missing', 'unavailable', 'warning', 'system', 'system')]
  const entries = system.areas.flatMap((area) => area.entries.map((entry) => ({ areaId: area.id, entry })))
  if (entries.length === 0) return [card('system-empty', 'notFound', 'warning', 'system', 'system')]
  const cards = entries
    .filter((item) => item.entry.status !== 'active')
    .map((item) => statusCard(`system-${item.areaId}-${item.entry.name}`, item.entry.status, 'system', systemRoute(item.areaId, item.entry), {
      detail: systemDetail(item.areaId, item.entry),
      targetLabel: item.entry.name,
      focusId: systemFocus(item.areaId, item.entry),
      ...systemCopy(item.areaId, item.entry, config)
    }))
  return cards
}

function watcherCards(watcher: Watcher | null): DiagnosisCard[] {
  if (!watcher) return [card('watcher-missing', 'unavailable', 'warning', 'watcher', 'updates')]
  const cards = watcher.daemon.status.toLowerCase().includes('paused')
    ? [card('watcher-paused', 'paused', 'warning', 'watcher', 'updates', {
      detail: watcher.daemon.note,
      targetLabel: watcher.daemon.status,
      focusId: 'watcher-daemon'
    })]
    : []
  if (watcher.sources.length === 0) cards.push(card('watcher-empty', 'notFound', 'warning', 'watcher', 'updates'))
  for (const source of watcher.sources.filter((source) => source.state !== 'current')) {
    cards.push(card(`watcher-${source.name}`, sourceStatus(source.state), 'warning', 'watcher', 'updates', {
      detail: source.note ?? source.path,
      targetLabel: source.name,
      focusId: `watcher-source-${source.name}`
    }))
  }
  return cards
}

interface DiagnosisTarget {
  detail?: string | null
  targetLabel?: string
  focusId?: string
  title?: string
  meaning?: string
  where?: string
  how?: string
  changeHint?: string
  causeKey?: string
}

function statusCard(id: string, status: EntryStatus, source: DiagnosisSource, target: Section, targetInfo?: DiagnosisTarget): DiagnosisCard {
  if (status === 'stale') return card(id, 'notFound', 'warning', source, target, targetInfo)
  if (status === 'archived') return card(id, 'paused', 'warning', source, target, targetInfo)
  return card(id, 'problemFound', 'warning', source, target, targetInfo)
}

function card(
  id: string,
  status: DiagnosisStatus,
  severityTone: DiagnosisSeverity,
  source: DiagnosisSource,
  target: Section,
  targetInfo: DiagnosisTarget = {}
): DiagnosisCard {
  const action = diagnosisAction(status, source, target, targetInfo)
  return {
    id,
    // Titel bleibt konkret: ohne expliziten Titel traegt die Zeile das
    // betroffene Ziel (z. B. „cache (Plugins)") statt einer generischen
    // Statusfloskel — Laien sehen sonst N identische „Ein Problem"-Zeilen
    // ohne Welches/Wo (Befund 2026-07-19).
    title: targetInfo.title ?? targetInfo.targetLabel ?? msg(`diagnostics.title.${status}`),
    status: msg(`diagnostics.status.${status}`),
    severity: msg(`diagnostics.severity.${severityTone}`),
    severityTone,
    source,
    meaning: targetInfo.meaning ?? msg(`diagnostics.meaning.${status}`),
    action: msg(`diagnostics.action.${status}`),
    where: targetInfo.where ?? whereText(source, target),
    how: targetInfo.how ?? `${msg(`diagnostics.action.${status}`)}: ${targetInfo.targetLabel ?? unknownTarget(source)}`,
    changeHint: targetInfo.changeHint ?? changeText(status, source, targetInfo.targetLabel),
    diagnosisAction: action,
    target,
    details: targetInfo.detail ? [msg('diagnostics.detail.source', { source: msg(`diagnostics.source.${source}`) }), targetInfo.detail] : [],
    causeKey: targetInfo.causeKey ?? id
  }
}

function systemRoute(areaId: string, entry: SystemEntry): Section {
  return isOllamaHint(areaId, entry) ? 'settings' : 'system'
}

function systemFocus(areaId: string, entry: SystemEntry): string {
  if (isOllamaHint(areaId, entry)) return 'settings-tab-sources'
  return `system-entry-${areaId}-${entry.id ?? entry.name}`
}

function systemCopy(areaId: string, entry: SystemEntry, config: AppData | null): Pick<DiagnosisTarget, 'title' | 'meaning' | 'where' | 'how' | 'changeHint' | 'causeKey'> {
  if (isOllamaHint(areaId, entry)) {
    return {
      ...ollamaDiagnosisCopy(config),
      causeKey: 'local-models:ollama-hints'
    }
  }
  return {
    where: `System > ${areaId}`,
    how: `Öffne den System-Eintrag ${entry.name} und prüfe Beschreibung, Status und Details.`,
    changeHint: 'Passe den betroffenen lokalen Dienst, Port oder Systempfad außerhalb der App an und lade danach neu.'
  }
}

function systemDetail(areaId: string, entry: SystemEntry): string {
  const detail = entry.conflictReason ?? entry.path ?? entry.desc
  return isOllamaHint(areaId, entry) ? ollamaEvidence(entry) : detail
}

function dedupeCauses(cards: DiagnosisCard[]): DiagnosisCard[] {
  const unique = new Map<string, DiagnosisCard>()
  for (const card of cards) {
    const existing = unique.get(card.causeKey)
    if (!existing) {
      unique.set(card.causeKey, card)
      continue
    }
    unique.set(card.causeKey, { ...existing, details: [...new Set([...existing.details, ...card.details])] })
  }
  return [...unique.values()]
}

function diagnosisAction(
  status: DiagnosisStatus,
  source: DiagnosisSource,
  route: Section,
  targetInfo: DiagnosisTarget
): OverviewNavigationAction {
  const targetDescription = targetInfo.targetLabel ?? targetInfo.detail ?? unknownTarget(source)
  return {
    label: `${msg(`diagnostics.action.${status}`)}: ${targetDescription}`,
    reason: msg(`diagnostics.meaning.${status}`),
    route,
    focusId: targetInfo.focusId,
    targetDescription: targetInfo.focusId ? undefined : targetDescription
  }
}

function sourceStatus(state: string): DiagnosisStatus {
  return state === 'gated' || state === 'flag' || state === 'update' ? 'problemFound' : 'notFound'
}

function sortCards(cards: DiagnosisCard[]): DiagnosisCard[] {
  return [...cards].sort((a, b) => {
    const severity = severityRank(a.severityTone) - severityRank(b.severityTone)
    if (severity !== 0) return severity
    return sourceRank(a.source) - sourceRank(b.source)
  })
}

function severityRank(severity: DiagnosisSeverity): number {
  if (severity === 'error') return 0
  if (severity === 'warning') return 1
  return 2
}

function sourceRank(source: DiagnosisSource): number {
  if (source === 'appErrors') return 0
  if (source === 'system') return 1
  if (source === 'watcher') return 2
  return 3
}
