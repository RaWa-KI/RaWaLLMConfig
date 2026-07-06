import { useEffect, useState } from 'react'
import type { Category, ConfigEntry } from '@shared/contract'
import { Icon } from './Icon'
import { ConfirmDialog } from './ConfirmDialog'
import { useWriteConfig } from '../state/store-write-config'
import { EditForm } from '../sections/config/EditForm'
import { EntryActions } from '../sections/config/EntryActions'
import './DrawerEdit.css'

// Editierbarer Drawer-Aufsatz (Teil C, WP-03). READ-ONLY bleibt Default; der
// Edit-Modus wird owner-getriggert (Stift-Button). Im Edit-Modus erscheinen
// EditForm (Vollinhalt via readFull) + EntryActions (add/archive/move). Mutation
// laeuft ueber store-write-config; ConfirmDialog liest die pending-Action.
// Die read-only Anzeige (Drawer.tsx, Phase 1) bleibt unveraendert erreichbar.

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

  // ConfirmDialog -> bei Bestaetigung passende store-write-Action ausfuehren.
  function onConfirm() {
    const p = wc.pending
    if (!p) return
    // ownerEdit (Owner-Override) NUR fuer edit/add weiterreichen; archive/move
    // bleiben hart secret-skip (kein ownerEdit-Argument).
    if (p.action === 'edit') void wc.editEntry(p.path, p.content ?? '', p.ownerEdit)
    else if (p.action === 'add') void wc.addEntry(p.path, p.content ?? '', p.ownerEdit)
    else if (p.action === 'archive') void wc.removeEntry(p.path)
    else if (p.action === 'move' && p.to) void wc.moveEntry(p.path, p.to)
  }

  // Write-Gate: Bearbeiten-Toggle deaktiviert wenn Write-Modus nicht aktiv.
  const gateDisabled = !wc.writeEnabled
  const toggleTitle = gateDisabled
    ? (wc.writeReason ?? 'Bearbeiten nicht aktiviert')
    : isEditing
      ? 'Bearbeitung schließen'
      : 'Bearbeiten'

  return (
    <div className="drawer-edit">
      <button
        className={'de-toggle' + (isEditing ? ' on' : '')}
        onClick={() => setEditOpen(!isEditing)}
        disabled={gateDisabled}
        title={toggleTitle}
      >
        {Icon.edit}
        <span>{isEditing ? 'Schließen' : 'Bearbeiten'}</span>
      </button>

      {isEditing && (
        <div className="de-panel">
          <EntryActions entry={entry} parentPath={cat.path} />
          <div className="de-divider" />
          <EditForm entry={entry} onDone={() => setEditOpen(false)} />
        </div>
      )}

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
    </div>
  )
}
