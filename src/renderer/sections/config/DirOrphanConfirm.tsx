import { Icon } from '../../components/Icon'
import { SICHERUNG } from '@shared/dup-labels'
import { useWriteConfig } from '../../state/store-write-config'
import { fetchContent } from './diff-shared'

// HR27-Split aus DirOrphanActions.tsx: Inline-Confirm fuer Uebernehmen/Archivieren
// einer nur-einseitig vorhandenen Datei. Kein Auto-Run — erst nach „Bestaetigen".
// Schreibt ueber die BESTEHENDEN gated Routen addEntry/removeEntry (backup-first).
// Beim Uebernehmen wird der ROHE Inhalt frisch geladen (kein maskierter Anzeige-
// Text), damit kein maskierter Text in die Gegenseite geschrieben wird.

export interface OrphanConfirmProps {
  kind: 'adopt' | 'archive'
  source: string
  target: string
  masked: boolean
  onCancel(): void
  onDone(): void
}

export function OrphanConfirm({ kind, source, target, masked, onCancel, onDone }: OrphanConfirmProps) {
  const { addEntry, removeEntry, busy, writeEnabled, writeReason } = useWriteConfig()
  const adopt = kind === 'adopt'
  const disabledTitle = !writeEnabled ? (writeReason ?? 'Schreibmodus nicht aktiv') : undefined

  async function confirm() {
    let ok = false
    if (kind === 'archive') {
      ok = await removeEntry(source)
    } else if (target && !masked) {
      // Roh + frisch laden — niemals maskierten Anzeige-Text uebernehmen.
      const raw = await fetchContent(source)
      if (raw !== null) ok = await addEntry(target, raw)
    }
    if (ok) onDone()
  }

  return (
    <div className="dir-drill-confirm">
      <div className="dup-confirm-title">
        {Icon.warn}
        {adopt ? 'Datei in die Gegenseite übernehmen?' : 'Datei archivieren?'}
      </div>
      <p className="dup-confirm-text">
        {adopt
          ? 'Die vorhandene Datei wird an der kanonischen Gegenseite angelegt (Sicherung vorher, falls dort schon vorhanden).'
          : 'Die Datei wird ins Archiv verschoben (nicht gelöscht).'}
      </p>
      <div className="dup-confirm-paths mono">
        <div>Quelle: {source}</div>
        {adopt && <div>Ziel: {target}</div>}
      </div>
      <div className="dup-confirm-hint">{Icon.snap}{SICHERUNG.snapshot}</div>
      <ConfirmButtons
        busy={busy}
        confirmOff={busy || !writeEnabled || (adopt && masked)}
        confirmTitle={disabledTitle}
        onCancel={onCancel}
        onConfirm={confirm}
      />
    </div>
  )
}

// Abbrechen-/Bestaetigen-Paar des Confirm-Blocks (bestehende .dup-btn-Stile).
function ConfirmButtons({
  busy,
  confirmOff,
  confirmTitle,
  onCancel,
  onConfirm
}: {
  busy: boolean
  confirmOff: boolean
  confirmTitle: string | undefined
  onCancel(): void
  onConfirm(): void
}) {
  return (
    <div className="dup-confirm-btns">
      <button type="button" className="dup-btn" onClick={onCancel} disabled={busy}>
        {Icon.x}Abbrechen
      </button>
      <button type="button" className="dup-btn adopt" onClick={onConfirm} disabled={confirmOff} title={confirmTitle}>
        {Icon.check}{busy ? 'Arbeitet …' : 'Bestätigen'}
      </button>
    </div>
  )
}
