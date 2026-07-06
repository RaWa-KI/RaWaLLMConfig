import { useEffect, useState } from 'react'
import type { ArchiveBackupEntry, ArchiveListResult } from '@shared/contract-archive'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { ArchivList } from './ArchivList'
import { RestoreConfirm } from './RestoreConfirm'
import './ArchivSection.css'

// Archiv-/Restore-Sektion (v1): laedt die read-only Backup-Liste EINMAL (nur
// stat, nie Inhalt), gruppiert nach Tag und bietet pro write/archive-Backup ein
// Restore an. Restore laeuft IMMER ueber RestoreConfirm (Owner-Confirm + Zielpfad)
// und den gated, backup-first Main-Handler. Snapshot-Ordner sind read-only.

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; msg: string }
  | { phase: 'done'; result: ArchiveListResult }

export function ArchivSection() {
  const { actions } = useStore()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  // Aktuell im Confirm-Dialog stehender Backup-Eintrag (null = kein Dialog).
  const [target, setTarget] = useState<ArchiveBackupEntry | null>(null)
  const [busy, setBusy] = useState(false)

  async function load(): Promise<void> {
    setState({ phase: 'loading' })
    try {
      if (typeof window === 'undefined' || !window.electronAPI?.archiveList) {
        setState({ phase: 'error', msg: 'Bridge nicht verfügbar' })
        return
      }
      const res = await window.electronAPI.archiveList()
      if (res.error || !res.data) {
        setState({ phase: 'error', msg: res.error ?? 'Archiv-Liste fehlgeschlagen' })
      } else {
        setState({ phase: 'done', result: res.data })
      }
    } catch (err) {
      setState({ phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  // EINMAL laden (leeres Dep-Array). Kein Re-Scan bei Re-Render.
  useEffect(() => {
    void load()
  }, [])

  // Restore ausloesen (nach Owner-Confirm im Dialog): gated Bridge-Aufruf,
  // danach Liste neu laden (neuer Pre-Restore-Snapshot taucht auf) + Toast.
  async function onRestore(entry: ArchiveBackupEntry, toPath: string): Promise<void> {
    if (!window.electronAPI?.archiveRestore) return
    setBusy(true)
    try {
      const res = await window.electronAPI.archiveRestore({ backupPath: entry.backupPath, toPath })
      if (res.error || !res.data) {
        actions.showToast(res.error ?? 'Wiederherstellung fehlgeschlagen', 'warn')
      } else {
        const snap = res.data.preRestoreSnapshot ? ' · Backup angelegt' : ''
        actions.showToast(`Wiederhergestellt: ${entry.originalName}${snap}`, 'check')
        setTarget(null)
        await load()
      }
    } catch (err) {
      actions.showToast(err instanceof Error ? err.message : 'Fehler beim Wiederherstellen', 'warn')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="main archivwrap">
      <div className="view-head">
        <div className="view-title">
          <h2>Archiv &amp; Wiederherstellen</h2>
          <p>HR7-Backups (Pre-Snapshots &amp; archivierte Dateien). Restore legt vorher ein neues Backup an.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={state.phase === 'loading'}>
          {Icon.refresh}
          {state.phase === 'loading' ? 'Lädt …' : 'Neu laden'}
        </button>
      </div>
      <ArchivBody state={state} onRestoreClick={setTarget} />
      {target && (
        <RestoreConfirm
          entry={target}
          busy={busy}
          onConfirm={(toPath) => void onRestore(target, toPath)}
          onCancel={() => setTarget(null)}
        />
      )}
    </main>
  )
}

// Lade-/Fehler-/Leer-Zustaende + Liste. Konklusion vor Detail (R-konform).
function ArchivBody(props: {
  state: LoadState
  onRestoreClick: (e: ArchiveBackupEntry) => void
}) {
  const { state, onRestoreClick } = props
  if (state.phase === 'loading') {
    return (
      <div className="empty">
        {Icon.refresh}
        <p>Lade Backup-Liste …</p>
      </div>
    )
  }
  if (state.phase === 'error') {
    const archiveGone = state.msg === 'archive-missing'
    return (
      <div className="empty archiv-error">
        {Icon.warn}
        <p>{archiveGone ? 'Archiv-Laufwerk nicht erreichbar (E:). Hub/Laufwerk neu starten.' : `Fehler: ${state.msg}`}</p>
      </div>
    )
  }
  const { entries, truncated } = state.result
  if (entries.length === 0) {
    return (
      <div className="empty">
        {Icon.archive}
        <p>Noch keine Backups vorhanden.</p>
      </div>
    )
  }
  return <ArchivList entries={entries} truncated={truncated} onRestoreClick={onRestoreClick} />
}
