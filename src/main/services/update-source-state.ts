import type { UpdateInfo, UpdateStateData } from '@shared/contract-updates'
import type { UpdateSourceDescription, UpdateSourcePort } from './update-source-port'
import { getDeps } from './update-manager-deps'
import { getUpdateState as getStateSnapshot, setSourceState } from './update-state'

export function updateSourceLabel(desc: UpdateSourceDescription): string {
  if (!desc.configured) return 'Quelle gerade nicht erreichbar'
  return desc.kind === 'local' ? 'Lokaler Update-Ordner' : 'Öffentliche Releases (GitHub)'
}

export function syncUpdateSource(
  source: UpdateSourcePort,
  version: string,
  error: string | null = null
): void {
  const desc = source.describe()
  setSourceState(desc.configured, version, desc.kind, updateSourceLabel(desc), error)
}

export function currentUpdateState(source: UpdateSourcePort): UpdateStateData {
  const current = getStateSnapshot()
  syncUpdateSource(source, current.currentVersion || getDeps().getVersion(), current.lastSourceError)
  return getStateSnapshot()
}

export function updateCheckPayload(st: UpdateStateData, hasUpdate: boolean, info: UpdateInfo | null) {
  return {
    hasUpdate,
    currentVersion: st.currentVersion,
    latestVersion: st.latestVersion,
    info,
    sourceConfigured: st.sourceConfigured,
    sourceKind: st.sourceKind,
    sourceLabel: st.sourceLabel,
    releaseNotes: st.releaseNotes,
    lastSourceError: st.lastSourceError,
  }
}
