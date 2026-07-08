import { ConfirmDialog } from '../../components/ConfirmDialog'
import { msg } from '../../lib/messages'

export type UpdateDialogKind = 'download' | 'install' | null

export function UpdateActionDialogs({
  dialog,
  latestVersion,
  busy,
  onDownloadConfirm,
  onInstallConfirm,
  onCancel
}: {
  dialog: UpdateDialogKind
  latestVersion: string | null
  busy: boolean
  onDownloadConfirm(): void
  onInstallConfirm(): void
  onCancel(): void
}) {
  return (
    <>
      <ConfirmDialog
        open={dialog === 'download'}
        title={msg('update.dialog.downloadTitle')}
        detail={msg('update.dialog.downloadDetail', { version: latestVersion ?? '' })}
        confirmLabel={msg('update.dialog.downloadConfirm')}
        busy={busy}
        onConfirm={onDownloadConfirm}
        onCancel={onCancel}
      />
      <ConfirmDialog
        open={dialog === 'install'}
        title={msg('update.dialog.installTitle')}
        detail={msg('update.dialog.installDetail')}
        confirmLabel={msg('update.dialog.installConfirm')}
        busy={busy}
        onConfirm={onInstallConfirm}
        onCancel={onCancel}
      />
    </>
  )
}
