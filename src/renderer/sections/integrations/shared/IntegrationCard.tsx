import { Icon } from '../../../components/Icon'
import { msg } from '../../../lib/messages'
import type { ModuleCardState } from './module-model'
import { statusLabel } from './module-model'
import { moduleDescription } from '@shared/messages/ux-copy'
import type { DisplayMode } from '../../../state/types'

interface IntegrationCardProps {
  module: ModuleCardState
  displayMode: DisplayMode
  busy: boolean
  bridgeReady: boolean
  onToggle(module: ModuleCardState): void
}

export function IntegrationCard(props: IntegrationCardProps) {
  const { module, displayMode, busy, bridgeReady, onToggle } = props
  const { definition } = module
  const canToggle = !definition.informational && bridgeReady
  const canChooseFolder = canToggle && definition.folderAction && typeof window.electronAPI?.pickFolder === 'function'
  const actionLabel = module.availability === 'active'
    ? msg('integrations.action.pause')
    : msg('integrations.action.activate')
  const icon = Icon[definition.icon] ?? Icon.plug

  async function chooseFolder(): Promise<void> {
    const result = await window.electronAPI?.pickFolder()
    if (!result?.data) return
    onToggle({ ...module, pendingRoot: result.data })
  }

  return (
    <article className={'mi-card mi-card--' + module.availability}>
      <div className="mi-card-head">
        <span className="mi-icon">{icon}</span>
        <div>
          <h3>{definition.label}</h3>
          <span className="mi-status">{statusLabel(module.availability)}</span>
        </div>
      </div>
      <p className="mi-detail">{moduleDescription(module.id, displayMode)}</p>
      <p className="mi-status-detail">Status: {module.detail ?? statusLabel(module.availability)}</p>
      {module.root && <p className="mi-root">{module.root}</p>}
      <div className="mi-actions">
        {!definition.informational && (
          <button type="button" className="btn-ghost sm" disabled={!canToggle || busy} onClick={() => onToggle(module)}>
            {actionLabel}
          </button>
        )}
        {definition.folderAction && (
          <button type="button" className="btn-ghost sm" disabled={!canChooseFolder || busy} onClick={() => void chooseFolder()}>
            {Icon.folder}
            {msg('integrations.action.chooseFolder')}
          </button>
        )}
      </div>
    </article>
  )
}
