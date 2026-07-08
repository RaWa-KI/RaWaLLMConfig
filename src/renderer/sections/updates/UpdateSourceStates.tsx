import type { UpdateStateData } from '@shared/contract-updates'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'

export function UpdateLoadingState() {
  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="ump-wrap">
        <div className="ump-checking">
          <span className="ump-spinner">{Icon.refresh}</span>
          {msg('update.loadingStatus')}
        </div>
      </div>
    </main>
  )
}

export function UpdateUnconfiguredState({
  label,
  onCheck,
  busy
}: {
  label: string
  onCheck(): void
  busy: boolean
}) {
  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="ump-wrap">
        <div className="ump-empty">
          <span className="ump-empty-ic">{Icon.plug}</span>
          <div className="ump-empty-title">{label}</div>
          <div className="ump-empty-hint">{msg('update.unconfiguredHint')}</div>
          <button className="ump-btn" onClick={onCheck} disabled={busy}>
            {Icon.refresh} {msg('update.retryCheck')}
          </button>
        </div>
      </div>
    </main>
  )
}

export function SourceNotice({ state }: { state: UpdateStateData }) {
  const checkedAt = state.lastCheckedAt
    ? new Date(state.lastCheckedAt).toLocaleString()
    : null
  return (
    <div className={state.lastSourceError ? 'ump-source-warning' : 'ump-source-facts'}>
      {state.lastSourceError && <span>{Icon.warn}</span>}
      <span>{msg('update.sourceStatus.localKnown', { version: state.currentVersion })}</span>
      <span>
        {checkedAt
          ? msg('update.sourceStatus.lastSuccess', { checkedAt })
          : msg('update.sourceStatus.neverChecked')}
      </span>
      {state.lastSourceError && <span>{msg('update.sourceStatus.noFreshResult')}</span>}
    </div>
  )
}
