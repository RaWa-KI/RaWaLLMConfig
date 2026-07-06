import { Icon } from '../../components/Icon'
import { SEITE, SICHERUNG, SPEICHERN, WRITE_AUS, seiteForFamily, speichernInKopie } from '@shared/dup-labels'
import { useStore } from '../../state/store'
import './MergeBar.css'

// Speichern-Leiste unter dem editierbaren Paar-Diff (v4-Mockup §Speichern-Leiste).
// Sichtbarer Sicherungs-Hinweis (backup-first laeuft main-seitig) + je Seite ein
// Speichern-Knopf (Shared / seite-abhaengige Seite) + Verwerfen. Alle sichtbaren
// Texte aus @shared/dup-labels. Gated: ohne Schreibmodus disabled + Grund-Tooltip.
// HR27-Split aus MergeEditor.tsx; reine Anzeige + Callbacks.

export type SaveSide = 'a' | 'b'

export function MergeBar({
  writeEnabled,
  writeReason,
  busy,
  dirty,
  onSave,
  onRevert
}: {
  writeEnabled: boolean
  writeReason: string | null
  busy: SaveSide | null
  dirty: boolean
  onSave(side: SaveSide): void
  onRevert(): void
}) {
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const seiteLabel = seite === 'codex' ? SEITE.codex : seite === 'workspace' ? SEITE.workspace : SEITE.claude
  const title = writeReason ?? WRITE_AUS
  return (
    <div className="merge-bar">
      <span className="sb-hint">
        {Icon.check}
        {SICHERUNG.inlineHinweis}
      </span>
      <div className="merge-bar-spacer" />
      <button
        type="button"
        className="merge-revert"
        disabled={!writeEnabled || !dirty || busy !== null}
        onClick={onRevert}
      >
        {SPEICHERN.verwerfen}
      </button>
      <SaveButton
        label={SPEICHERN.inShared}
        disabled={!writeEnabled}
        busy={busy === 'a'}
        title={title}
        onClick={() => onSave('a')}
      />
      <SaveButton
        label={speichernInKopie(seiteLabel)}
        disabled={!writeEnabled}
        busy={busy === 'b'}
        title={title}
        onClick={() => onSave('b')}
      />
      {!writeEnabled && <span className="merge-ro-hint">{title}</span>}
    </div>
  )
}

// Einzelner Speichern-Button (disabled-Gate + busy-Anzeige).
function SaveButton({
  label,
  disabled,
  busy,
  title,
  onClick
}: {
  label: string
  disabled: boolean
  busy: boolean
  title: string
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="merge-save"
      disabled={disabled || busy}
      title={disabled ? title : undefined}
      onClick={onClick}
    >
      {busy ? SPEICHERN.speichert : label}
    </button>
  )
}
