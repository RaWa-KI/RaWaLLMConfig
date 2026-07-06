import { useMemo, useState } from 'react'
import type { ConfigEntry } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { PathPicker } from './PathPicker'
import { buildKnownPaths } from './known-paths'
import './EntryActions.css'

// CRUD-Controls (Teil C, WP-05): hinzufuegen (add), archivieren (= HR7-Archiv,
// NIE "loeschen"), verschieben (move). Jede Aktion oeffnet den Confirm-Flow ueber
// store-write (requestWrite -> ConfirmDialog -> writeApply). Kein Direkt-IPC,
// kein fs im Renderer. add/move brauchen einen Zielpfad (Owner-Eingabe).

interface EntryActionsProps {
  entry: ConfigEntry
  // Default-Parent fuer neue Dateien (z.B. Kategorie-Pfad). Sichtbar, nie Secret.
  parentPath: string
}

type Pending = 'move' | 'add' | null

export function EntryActions({ entry, parentPath }: EntryActionsProps) {
  const wc = useWriteConfig()
  const { config, ui } = useStore()
  const [open, setOpen] = useState<Pending>(null)
  const [target, setTarget] = useState('')
  const knownPaths = useMemo(
    () => buildKnownPaths(config.data, ui.llm, parentPath),
    [config.data, ui.llm, parentPath]
  )

  // archive (remove): direkt in den Confirm-Flow; Label bleibt "archivieren".
  function onArchive() {
    wc.requestWrite({
      action: 'archive',
      path: entry.path,
      label: `${entry.name} archivieren (verschiebt ins Archiv, kein Löschen)`
    })
  }

  // move/add: Zielpfad-Eingabe ausklappen, dann Confirm-Flow ausloesen.
  function submitTarget() {
    if (!target.trim()) return
    if (open === 'move') {
      wc.requestWrite({ action: 'move', path: entry.path, to: target.trim(), label: `${entry.name} verschieben` })
    } else if (open === 'add') {
      wc.requestWrite({ action: 'add', path: target.trim(), content: '', label: `Neue Datei anlegen` })
    }
    setOpen(null)
    setTarget('')
  }

  function toggle(kind: Exclude<Pending, null>) {
    const next = open === kind ? null : kind
    setOpen(next)
    setTarget(next === 'add' ? parentPath.replace(/\/?$/, '/') : entry.path)
  }

  // Write-Gate: Buttons deaktiviert wenn Write-Modus nicht aktiv.
  const gateDisabled = !wc.writeEnabled
  const gateTitle = wc.writeReason ?? undefined

  return (
    <div className="entry-actions">
      <div className="ea-row">
        <button
          type="button"
          className="ea-btn"
          onClick={() => toggle('add')}
          disabled={wc.busy || gateDisabled}
          title={gateDisabled ? gateTitle : undefined}
        >
          {Icon.plus}
          <span>Hinzufügen</span>
        </button>
        <button
          type="button"
          className="ea-btn"
          onClick={() => toggle('move')}
          disabled={wc.busy || gateDisabled}
          title={gateDisabled ? gateTitle : undefined}
        >
          {Icon.arrow}
          <span>Verschieben</span>
        </button>
        <button
          type="button"
          className="ea-btn danger"
          onClick={onArchive}
          disabled={wc.busy || gateDisabled}
          title={gateDisabled ? gateTitle : undefined}
        >
          {Icon.archive}
          <span>Archivieren</span>
        </button>
      </div>
      {open && (
        <div className="ea-target">
          <PathPicker
            value={target}
            onChange={setTarget}
            options={knownPaths}
            placeholder={open === 'add' ? 'Pfad der neuen Datei suchen …' : 'Neuen Zielpfad suchen …'}
            onSubmit={submitTarget}
          />
          <button type="button" className="ea-btn primary" onClick={submitTarget} disabled={!target.trim()}>
            Weiter …
          </button>
        </div>
      )}
    </div>
  )
}
