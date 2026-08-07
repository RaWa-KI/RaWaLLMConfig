import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'

// Versions-Refresh im Updates-/Watcher-Bereich (WP-F4F9, 2026-08-07): leert den
// CLI-Versions-Cache im Main (IPC refreshVersions) und laedt danach via
// onReload() ALLES frisch — bewusst Voll-Reload, weil System UND Watcher neue
// Versions-Spawns brauchen (Muster: RefreshVersionsButton in SystemSection).
// Read-only Owner-Aktion: kein Write-Gate, kein Confirm.
export function UpdatesRefreshButton({ onReload }: { onReload(): void }) {
  const [busy, setBusy] = useState(false)
  const onClick = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api || busy) return
    setBusy(true)
    try {
      await api.refreshVersions()
      onReload()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void onClick()}>
      {Icon.refresh}
      {busy ? msg('update.watcher.refreshing') : msg('update.watcher.refresh')}
    </button>
  )
}
