import { useEffect, useState } from 'react'
import type { Category, ConfigEntry } from '@shared/contract'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { useWriteConfig } from '../state/store-write-config'
import type { WriteConfigValue } from '../state/store-write-config'
import { EditForm } from '../sections/config/EditForm'
import { EntryActions } from '../sections/config/EntryActions'
import './DrawerEdit.css'

// Editierbarer Drawer-Aufsatz (Teil C, WP-03). READ-ONLY bleibt Default; der
// Edit-Modus wird owner-getriggert (Stift-Button). Im Edit-Modus erscheinen
// EditForm (Vollinhalt via readFull) + EntryActions (add/archive/move). Mutation
// laeuft ueber store-write-config; ConfirmDialog liest die pending-Action.
// Die read-only Anzeige (Drawer.tsx, Phase 1) bleibt unveraendert erreichbar.
// WP-5 (B6/B7): Eintraege ohne eigene Datei (fileBacked === false, z.B.
// Inferenz-Endpoints oder Cloud-Katalog) bekommen KEIN Datei-Edit-Panel und
// keine CRUD-Aktionen — nur einen erklaerenden Hinweis.

// Laienverstaendlicher Hinweis (HR28) fuer Eintraege ohne eigene Datei.
const NO_FILE_HINT =
  'Dieser Eintrag beschreibt einen Dienst oder Server (z. B. einen lokalen ' +
  'LLM-Endpunkt oder einen Cloud-Zugang) und hat keine eigene Datei. Er kann ' +
  'hier nicht bearbeitet, verschoben oder archiviert werden. Ändern kannst du ' +
  'ihn in den Einstellungen des jeweiligen Programms.'

interface DrawerEditProps {
  cat: Category
  entry: ConfigEntry
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DrawerEdit({ cat, entry, open, onOpenChange }: DrawerEditProps) {
  const wc = useWriteConfig()
  const [editing, setEditing] = useState(false)
  const isEditing = open ?? editing

  function setEditOpen(next: boolean) {
    if (onOpenChange) onOpenChange(next)
    else setEditing(next)
  }

  // Bei Entry-Wechsel zurueck auf read-only Default (Edit nie persistent).
  useEffect(() => {
    setEditOpen(false)
  }, [entry.id])

  // Eintraege ohne eigene Datei: kein Bearbeiten-Panel, keine CRUD-Aktionen,
  // kein readFull — nur der Hinweis. ConfirmDialog entfaellt (keine Writes).
  if (entry.fileBacked === false) {
    return (
      <div className="drawer-edit">
        <p className="de-nofile">{NO_FILE_HINT}</p>
      </div>
    )
  }

  return (
    <div className="drawer-edit">
      <EditToggle
        isEditing={isEditing}
        writeEnabled={wc.writeEnabled}
        writeReason={wc.writeReason}
        onToggle={() => setEditOpen(!isEditing)}
      />
      {isEditing && <EditPanel cat={cat} entry={entry} onDone={() => setEditOpen(false)} />}
      <EditConfirm wc={wc} />
    </div>
  )
}

// Bearbeiten-Toggle (Write-Gate: deaktiviert wenn Write-Modus nicht aktiv).
function EditToggle({
  isEditing,
  writeEnabled,
  writeReason,
  onToggle
}: {
  isEditing: boolean
  writeEnabled: boolean
  writeReason: string | null
  onToggle(): void
}) {
  const title = !writeEnabled
    ? (writeReason ?? 'Bearbeiten nicht aktiviert')
    : isEditing
      ? 'Bearbeitung schließen'
      : 'Bearbeiten'
  return (
    <button
      className={'de-toggle' + (isEditing ? ' on' : '')}
      onClick={onToggle}
      disabled={!writeEnabled}
      title={title}
    >
      {Icon.edit}
      <span>{isEditing ? 'Schließen' : 'Bearbeiten'}</span>
    </button>
  )
}

// Edit-Panel: EntryActions (add/archive/move) + EditForm (Vollinhalt-Editor).
function EditPanel({ cat, entry, onDone }: { cat: Category; entry: ConfigEntry; onDone(): void }) {
  return (
    <div className="de-panel">
      <EntryActions entry={entry} parentPath={cat.path} />
      <div className="de-divider" />
      <EditForm entry={entry} onDone={onDone} />
    </div>
  )
}

// ConfirmDialog -> bei Bestaetigung passende store-write-Action ausfuehren.
// ownerEdit (Owner-Override) NUR fuer edit/add weiterreichen; archive/move
// bleiben hart secret-skip (kein ownerEdit-Argument).
function EditConfirm({ wc }: { wc: WriteConfigValue }) {
  function onConfirm() {
    const p = wc.pending
    if (!p) return
    if (p.action === 'edit') void wc.editEntry(p.path, p.content ?? '', p.ownerEdit)
    else if (p.action === 'add') void wc.addEntry(p.path, p.content ?? '', p.ownerEdit)
    else if (p.action === 'archive') void wc.removeEntry(p.path)
    else if (p.action === 'move' && p.to) void wc.moveEntry(p.path, p.to)
  }

  return (
    <ConfirmDialog
      open={wc.pending !== null}
      title="Änderung bestätigen"
      detail={wc.pending?.label ?? ''}
      targetPath={wc.pending?.to ?? wc.pending?.path}
      confirmLabel="Schreiben"
      busy={wc.busy}
      onConfirm={onConfirm}
      onCancel={wc.cancelWrite}
    />
  )
}
