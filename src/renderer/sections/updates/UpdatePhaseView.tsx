import type { UpdatePhase, UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { Icon } from '../../components/Icon'
import { fmtSize } from '../../lib/fmt-size'
import { msg } from '../../lib/messages'
import { updateErrorMessage } from '../../state/update-manager-bridge'

function IdleCard({ state, onCheck, busy }: {
  state: UpdateStateData
  onCheck(): void
  busy: boolean
}) {
  return (
    <div className="ump-idle-card">
      <span className="ump-idle-ic">{Icon.check}</span>
      <div className="ump-idle-body">
        <div className="ump-idle-title">{msg('update.idleTitle')}</div>
        <div className="ump-idle-ver">
          <span className="ump-version-chip mono">{state.currentVersion}</span>
        </div>
      </div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} {msg('update.check')}
      </button>
    </div>
  )
}

function SourceErrorCard({ state, onCheck, busy }: {
  state: UpdateStateData
  onCheck(): void
  busy: boolean
}) {
  return (
    <div className="ump-error">
      <span className="ump-error-ic">{Icon.warn}</span>
      <div className="ump-error-msg">
        <b>{msg('update.sourceError.title')}</b>
        <span>{msg('update.sourceError.detail', { sourceLabel: state.sourceLabel })}</span>
      </div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} {msg('update.retryCheck')}
      </button>
    </div>
  )
}

function NoPlatformAssetCard({ onCheck, busy }: {
  onCheck(): void
  busy: boolean
}) {
  return (
    <div className="ump-error">
      <span className="ump-error-ic">{Icon.warn}</span>
      <div className="ump-error-msg">
        <b>{msg('update.noPlatformAsset.title')}</b>
        <span>{msg('update.noPlatformAsset.detail')}</span>
      </div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} {msg('update.retryCheck')}
      </button>
    </div>
  )
}

function AvailableCard({ state, onDownload, busy }: {
  state: UpdateStateData
  onDownload(): void
  busy: boolean
}) {
  return (
    <div className="ump-avail-card">
      <div className="ump-avail-head">
        <span className="pill conflict"><span className="pd" />{msg('update.availableLabel')}</span>
        <span className="ump-avail-ver mono">{state.latestVersion}</span>
        <span className="ump-version-chip mono">{msg('update.currentVersion', { version: state.currentVersion })}</span>
      </div>
      {state.assetName && <div className="ump-notes mono">{state.assetName}</div>}
      <div>
        <button className="ump-btn primary" onClick={onDownload} disabled={busy}>
          {Icon.up} {msg('update.download')}
        </button>
      </div>
    </div>
  )
}

function ProgressRow({ progress }: { progress: UpdateProgressPayload | null }) {
  const pct = progress?.percentage ?? 0
  const copied = progress?.copied ?? 0
  const total = progress?.total ?? 0
  return (
    <div className="ump-progress">
      <div className="ump-progress-label">
        <span className="ump-spinner">{Icon.refresh}</span>
        {msg('update.downloadProgress')}
      </div>
      <div className="ump-bar-track">
        <div className="ump-bar-fill" style={{ width: pct + '%' }} />
      </div>
      <div className="ump-progress-bytes">
        {msg('update.progressBytes', {
          copied: fmtSize(copied),
          total: fmtSize(total),
          percentage: String(Math.round(pct))
        })}
      </div>
    </div>
  )
}

function ReadyCard({ state, onInstall, busy }: {
  state: UpdateStateData
  onInstall(): void
  busy: boolean
}) {
  return (
    <div className="ump-ready-card">
      <span className="pill active"><span className="pd" />{msg('update.readyBadge')}</span>
      <div className="ump-ready-body">
        <div className="ump-ready-title">{msg('update.readyTitle')}</div>
        <div className="ump-ready-hint">{state.assetName ?? msg('update.installerReady')}</div>
      </div>
      <button className="ump-btn sage" onClick={onInstall} disabled={busy}>
        {Icon.up} {msg('update.install')}
      </button>
    </div>
  )
}

function ErrorRow({ message, onCheck, busy }: { message: string; onCheck(): void; busy: boolean }) {
  return (
    <div className="ump-error">
      <span className="ump-error-ic">{Icon.warn}</span>
      <div className="ump-error-msg">{message}</div>
      <button className="ump-btn" onClick={onCheck} disabled={busy}>
        {Icon.refresh} {msg('update.retryCheck')}
      </button>
    </div>
  )
}

export function UpdatePhaseView({
  state,
  progress,
  busy,
  onCheck,
  onDownload,
  onInstall
}: {
  state: UpdateStateData
  progress: UpdateProgressPayload | null
  busy: boolean
  onCheck(): void
  onDownload(): void
  onInstall(): void
}) {
  const phase: UpdatePhase = state.phase
  if (phase === 'checking') return <CheckingState />
  if (phase === 'available') return <AvailableCard state={state} onDownload={onDownload} busy={busy} />
  if (phase === 'downloading') return <ProgressRow progress={progress} />
  if (phase === 'ready') return <ReadyCard state={state} onInstall={onInstall} busy={busy} />
  if (phase === 'installing') return <InstallingState />
  if (phase === 'error') {
    const errorMessage = updateErrorMessage(state.lastError) ?? msg('update.unknownError')
    return <ErrorRow message={errorMessage} onCheck={onCheck} busy={busy} />
  }
  if (state.noPlatformAsset) return <NoPlatformAssetCard onCheck={onCheck} busy={busy} />
  if (state.lastSourceError) return <SourceErrorCard state={state} onCheck={onCheck} busy={busy} />
  return <IdleCard state={state} onCheck={onCheck} busy={busy} />
}

function CheckingState() {
  return (
    <div className="ump-checking">
      <span className="ump-spinner">{Icon.refresh}</span>
      {msg('update.checking')}
    </div>
  )
}

function InstallingState() {
  return (
    <div className="ump-installing">
      <span className="ump-spinner">{Icon.refresh}</span>
      {msg('update.restarting')}
    </div>
  )
}
