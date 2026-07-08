import { useState } from 'react'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { UpdatesDataView } from './UpdatesDataView'
import './UpdatesSection.css'

// Updates-Sektion: Toolchain-Watcher read-only (Phase 1).
// Anzeige aus watcher.data — kein Add/Edit/Drawer, keine Mutation.
// Praesentations- und Listenmodule liegen colocated in diesem Ordner.

export function UpdatesSection() {
  const { watcher } = useStore()
  const [filter, setFilter] = useState('all')

  if (watcher.loading) {
    return (
      <main className="main upd-full">
        <p className="upd-loading">lädt…</p>
      </main>
    )
  }
  if (!watcher.data || watcher.error) {
    return (
      <main className="main upd-full">
        <div className="empty-state">
          <div className="empty">{watcher.error ?? 'Keine Watcher-Daten verfügbar.'}</div>
        </div>
      </main>
    )
  }

  return <UpdatesDataView filter={filter} onFilter={setFilter} watcher={watcher.data} />
}
