import { useState } from 'react'
import { useUpdateManager } from '../../state/store-update-manager'
import { UpdateLoadingState, UpdateUnconfiguredState } from './UpdateSourceStates'
import { UpdateConfiguredPanel } from './UpdateConfiguredPanel'
import type { UpdateDialogKind } from './UpdateActionDialogs'
import './UpdateManagerPanel.css'
import './UpdatesSection.css'

export function UpdateManagerPanel() {
  const { state, busy, progress, check, download, install } = useUpdateManager()
  const [dialog, setDialog] = useState<UpdateDialogKind>(null)

  if (!state) return <UpdateLoadingState />

  if (!state.sourceConfigured) {
    return (
      <UpdateUnconfiguredState
        label={state.sourceLabel || 'Quelle gerade nicht erreichbar'}
        onCheck={() => { void check() }}
        busy={busy}
      />
    )
  }

  const handleDownloadConfirm = async () => {
    setDialog(null)
    await download()
  }
  const handleInstallConfirm = async () => {
    setDialog(null)
    await install()
  }

  return (
    <UpdateConfiguredPanel
      state={state}
      progress={progress}
      busy={busy}
      dialog={dialog}
      onCheck={() => { void check() }}
      onDownload={() => setDialog('download')}
      onInstall={() => setDialog('install')}
      onDownloadConfirm={() => { void handleDownloadConfirm() }}
      onInstallConfirm={() => { void handleInstallConfirm() }}
      onCancelDialog={() => setDialog(null)}
    />
  )
}
