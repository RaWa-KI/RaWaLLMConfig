// diagnosis-focus-resolvers.ts — Fokus-Ableitung und -Auflösung der
// Diagnosekarten, aus diagnosis-model.ts extrahiert (HR27-Split, WP-F1F8).
// Eine Verantwortung: Alles rund um focusIds — wie eine Karte ihr Sprungziel
// benennt (Ableitung) und ob/wohin ein gespeicherter Fokus in der Zielsektion
// tatsächlich springen kann (Auflösung für den Details-Link der FocusNotice).
import type { AppData, System, SystemEntry, Watcher } from '@shared/contract'
import { msg } from '../../lib/messages'
import type { Section } from '../../state/types'
import { resolveConfigFocusTarget, type ConfigFocusResolution } from '../config/config-focus'
import { unknownTarget } from './diagnosis-cards-filter'
import { isOllamaHint } from './diagnosis-ollama'
import type { DiagnosisSource, DiagnosisStatus } from './diagnosis-model'
import type { OverviewNavigationAction } from './overview-navigation'

// ---------------------------------------------------------------------------
// Ableitung: Karte → Route/focusId/Navigations-Action
// ---------------------------------------------------------------------------

export function systemRoute(areaId: string, entry: SystemEntry): Section {
  return isOllamaHint(areaId, entry) ? 'settings' : 'system'
}

export function systemFocus(areaId: string, entry: SystemEntry): string {
  if (isOllamaHint(areaId, entry)) return 'settings-tab-sources'
  return `system-entry-${areaId}-${entry.id ?? entry.name}`
}

interface DiagnosisActionInfo {
  targetLabel?: string
  detail?: string | null
  focusId?: string
}

export function diagnosisAction(
  status: DiagnosisStatus,
  source: DiagnosisSource,
  route: Section,
  targetInfo: DiagnosisActionInfo
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

// ---------------------------------------------------------------------------
// Auflösung: gespeicherter Fokus → konkretes Sprungziel in der Zielsektion
// ---------------------------------------------------------------------------

// Sprungziel des Details-Links der FocusNotice. 'config' läuft über die
// Store-Actions (Drawer/Familie/Dubletten), die übrigen Arten über ein
// DOM-Element (System-Zeile, Settings-Tab, Watcher-Karte).
export type FocusJump =
  | { kind: 'config'; target: ConfigFocusResolution }
  | { kind: 'system'; areaId: string; rowId: string }
  | { kind: 'settingsTab'; elementId: string }
  | { kind: 'element'; elementId: string }

export interface FocusJumpData {
  config: AppData | null
  system: System | null
  watcher: Watcher | null
}

// Löst einen Fokus gegen die geladenen Daten auf. null = kein belastbares
// Sprungziel — die Erklärbox zeigt dann bewusst keinen Details-Link (ehrlicher
// Text statt totem Versprechen, WP-F1F8). load-* (App-Ladefehler) hat per
// Design kein Ziel: die Fundstelle steht bereits im Kartentext.
export function resolveFocusJump(
  section: Section,
  focusId: string | null | undefined,
  data: FocusJumpData
): FocusJump | null {
  if (!focusId || focusId.startsWith('load-')) return null
  if (section === 'config') {
    const target = resolveConfigFocusTarget(data.config, focusId)
    return target ? { kind: 'config', target } : null
  }
  if (section === 'system') return resolveSystemJump(data.system, focusId)
  if (section === 'settings') {
    return focusId.startsWith('settings-tab-') ? { kind: 'settingsTab', elementId: focusId } : null
  }
  if (section === 'updates') return resolveWatcherJump(data.watcher, focusId)
  return null
}

function resolveSystemJump(system: System | null, focusId: string): FocusJump | null {
  const match = focusId.match(/^system-entry-([^-]+)-(.+)$/)
  if (!match || !system) return null
  const area = system.areas.find((item) => item.id === match[1])
  if (!area) return null
  return { kind: 'system', areaId: area.id, rowId: focusId }
}

function resolveWatcherJump(watcher: Watcher | null, focusId: string): FocusJump | null {
  if (!watcher) return null
  if (focusId === 'watcher-daemon') return { kind: 'element', elementId: 'watcher-daemon' }
  const source = focusId.match(/^watcher-source-(.+)$/)
  if (source && watcher.sources.some((item) => item.name === source[1])) {
    return { kind: 'element', elementId: focusId }
  }
  return null
}
