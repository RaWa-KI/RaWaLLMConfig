import { Icon } from './Icon'
import './ConfirmDialog.css'

// Wiederverwendbarer Confirm-Dialog (Teil C). Zeigt vor JEDER Mutation den
// geplanten Vorgang + den sichtbaren Backup-Hinweis (Teil-A backup-first legt
// einen Pre-Snapshot im HR7-Archiv an). Bestaetigt -> onConfirm; Abbruch -> kein
// Write. Reines Anzeige-Bauteil; Backup/Apply passiert im Main (Write-API).

const BACKUP_HINT =
  'Vor dem Schreiben wird automatisch ein Pre-Snapshot im Archiv angelegt (backup-first). Nichts geht verloren.'

interface ConfirmDialogProps {
  open: boolean
  title: string
  detail: string
  // Sichtbarer Ziel-Pfad (Name, nie Secret-Wert) zur Owner-Kontrolle.
  targetPath?: string
  confirmLabel?: string
  busy?: boolean
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({
  open,
  title,
  detail,
  targetPath,
  confirmLabel = 'Bestätigen',
  busy = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="cd-back" onClick={onCancel}>
      <div className="cd-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="cd-head">
          <span className="cd-ic">{Icon.warn}</span>
          <h3>{title}</h3>
        </div>
        <p className="cd-detail">{detail}</p>
        {targetPath && (
          <div className="cd-target">
            <span className="cd-target-k">Ziel</span>
            <span className="cd-target-v mono">{targetPath}</span>
          </div>
        )}
        <div className="cd-backup">
          {Icon.check}
          <span>{BACKUP_HINT}</span>
        </div>
        <div className="cd-actions">
          <button className="cd-btn ghost" onClick={onCancel} disabled={busy}>
            Abbrechen
          </button>
          <button className="cd-btn primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Schreibt …' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
