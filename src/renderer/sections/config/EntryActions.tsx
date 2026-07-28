import { useMemo, useState } from 'react'
import type { ConfigEntry } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import type { WriteConfigValue } from '../../state/store-write-config'
import { PathPicker } from './PathPicker'
import { buildKnownPaths } from './known-paths'
import './EntryActions.css'

// CRUD-Controls (Teil C, WP-05): hinzufuegen (add), archivieren (= HR7-Archiv,
// NIE "loeschen"), verschieben (move). Jede Aktion oeffnet den Confirm-Flow ueber
// store-write (requestWrite -> ConfirmDialog -> writeApply). Kein Direkt-IPC,
// kein fs im Renderer. add/move brauchen einen Zielpfad (Owner-Eingabe).
// WP-5 (Owner-Auflage): das Prefill der Zielpfad-Eingabe nutzt IMMER entry.path,
// NIE den Kategorie-Pfad (cat.path kann eine URL sein, z.B. bei Endpoint-
// Kategorien). Eintraege ohne eigene Datei (fileBacked === false) erreichen
// diese Komponente gar nicht — DrawerEdit zeigt dort nur einen Hinweis.

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
    // Owner-Auflage (WP-5): Prefill immer der EINTRAGS-Pfad, nie cat.path.
    setTarget(entry.path)
  }

  return (
    <div className="entry-actions">
      <ActionRow wc={wc} onToggle={toggle} onArchive={onArchive} />
      {open && (
        <TargetInput
          open={open}
          target={target}
          knownPaths={knownPaths}
          onChange={setTarget}
          onSubmit={submitTarget}
        />
      )}
    </div>
  )
}

// Aktions-Zeile (Write-Gate: Buttons deaktiviert wenn Write-Modus nicht aktiv).
function ActionRow({
  wc,
  onToggle,
  onArchive
}: {
  wc: WriteConfigValue
  onToggle(kind: Exclude<Pending, null>): void
  onArchive(): void
}) {
  const gateDisabled = !wc.writeEnabled
  const gateTitle = wc.writeReason ?? undefined
  return (
    <div className="ea-row">
      <button
        type="button"
        className="ea-btn"
        onClick={() => onToggle('add')}
        disabled={wc.busy || gateDisabled}
        title={gateDisabled ? gateTitle : undefined}
      >
        {Icon.plus}
        <span>Hinzufügen</span>
      </button>
      <button
        type="button"
        className="ea-btn"
        onClick={() => onToggle('move')}
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
  )
}

// Zielpfad-Eingabe fuer move/add (PathPicker + Bestaetigen-Button).
function TargetInput({
  open,
  target,
  knownPaths,
  onChange,
  onSubmit
}: {
  open: Exclude<Pending, null>
  target: string
  knownPaths: string[]
  onChange(v: string): void
  onSubmit(): void
}) {
  return (
    <div className="ea-target">
      <PathPicker
        value={target}
        onChange={onChange}
        options={knownPaths}
        placeholder={open === 'add' ? 'Pfad der neuen Datei suchen …' : 'Neuen Zielpfad suchen …'}
        onSubmit={onSubmit}
      />
      <button type="button" className="ea-btn primary" onClick={onSubmit} disabled={!target.trim()}>
        Weiter …
      </button>
    </div>
  )
}
