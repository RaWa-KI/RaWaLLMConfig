import type { UpdateProgressPayload, UpdateStateData } from '@shared/contract-updates'
import { msg } from '../../lib/messages'
import { SourceNotice } from './UpdateSourceStates'
import { UpdatePhaseView } from './UpdatePhaseView'
import { UpdateActionDialogs, type UpdateDialogKind } from './UpdateActionDialogs'

type UpdateConfiguredPanelProps = {
  state: UpdateStateData
  progress: UpdateProgressPayload | null
  busy: boolean
  dialog: UpdateDialogKind
  onCheck(): void
  onDownload(): void
  onInstall(): void
  onDownloadConfirm(): void
  onInstallConfirm(): void
  onCancelDialog(): void
}

export function UpdateConfiguredPanel({
  state,
  progress,
  busy,
  dialog,
  onCheck,
  onDownload,
  onInstall,
  onDownloadConfirm,
  onInstallConfirm,
  onCancelDialog
}: UpdateConfiguredPanelProps) {
  return (
    <main className="main" style={{ gridColumn: '1 / -1' }}>
      <div className="view-head">
        <div className="view-title">
          <h2>{msg('update.title')}</h2>
          <p>
            {msg('update.versionPrefix', { sourceLabel: state.sourceLabel })}{' '}
            <span className="mono">{state.currentVersion}</span>
          </p>
        </div>
      </div>
      <div className="ump-wrap">
        <SourceNotice state={state} />
        <UpdatePhaseView
          state={state}
          progress={progress}
          busy={busy}
          onCheck={onCheck}
          onDownload={onDownload}
          onInstall={onInstall}
        />
      </div>
      <UpdateActionDialogs
        dialog={dialog}
        latestVersion={state.latestVersion}
        busy={busy}
        onDownloadConfirm={onDownloadConfirm}
        onInstallConfirm={onInstallConfirm}
        onCancel={onCancelDialog}
      />
    </main>
  )
}
