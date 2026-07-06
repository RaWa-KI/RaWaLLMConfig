import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { ConfirmDialog } from '../../components/ConfirmDialog'

// ConfigWriteConfirm — Confirm-Consumer für gated Schreib-Aktionen aus der
// Config-Ansicht, die über wc.requestWrite(pending) laufen (v.a. der Übersicht-
// Direkt-Editor OverviewEditor, WP-09). Der DrawerEdit-Consumer existiert NUR bei
// offenem Drawer (ui.sel != null); ohne diesen Consumer bliebe ein Übersicht-Save
// ohne Confirm/Apply hängen. Damit nie ZWEI Dialoge gleichzeitig offen sind, wird
// dieser Consumer NUR bei geschlossenem Drawer (ui.sel == null) gemountet —
// disjunkt zum DrawerEdit-Consumer. Reine Verdrahtung: Apply läuft im Main
// (backup-first, Secret-Guard); maskierter/gekürzter Inhalt wird nie übergeben
// (OverviewEditor sperrt das vor requestWrite).
export function ConfigWriteConfirm() {
  const { ui } = useStore()
  const wc = useWriteConfig()
  // Drawer offen -> DrawerEdit liefert den Consumer; hier nichts rendern.
  if (ui.sel !== null) return null

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
