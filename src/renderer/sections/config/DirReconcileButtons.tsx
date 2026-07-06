import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import type { DirAction } from './DirConfirmBlock'
import {
  BEHALTEN,
  BEHALTEN_MIRROR,
  UEBERNEHMEN,
  UEBERNEHMEN_TRUNK,
  CONFIRM,
  labelOrdnerAktion,
  seiteForFamily
} from '@shared/dup-labels'
import './DirReconcileButtons.css'

// DirReconcileButtons — Button-Reihen der Ordner-Aktions-Zeile (aus
// DirReconcileActions.tsx ausgelagert, HR27). SYMMETRISCH (Finding B): ein
// „Welche Version bleibt?"-Umschalter (Shared|Claude) polt die Default-/Bulk-
// Richtung um — KEIN Shared-Bias. Bei canon='trunk' wirken Uebernehmen/Behalten
// auf die Shared-Seite, bei canon='mirror' spiegelbildlich auf die Claude-Seite.
// Sichtbare Texte ausschliesslich aus @shared/dup-labels.

export type Canon = 'trunk' | 'mirror'

interface CanonToggleProps {
  canon: Canon
  onCanon(c: Canon): void
  disabled: boolean
}

// Umschalter: welche Version standardmaessig ueberlebt (Shared oder Claude).
export function CanonToggle({ canon, onCanon, disabled }: CanonToggleProps) {
  const { ui } = useStore()
  const c = CONFIRM(seiteForFamily(ui.llm))
  return (
    <div className="dup-canon" role="group" aria-label={c.kanonFrage}>
      <span className="dup-canon-q">{c.kanonFrage}</span>
      <button
        type="button"
        className={'dup-canon-btn' + (canon === 'trunk' ? ' active' : '')}
        onClick={() => onCanon('trunk')}
        disabled={disabled}
      >
        {c.kanonShared}
      </button>
      <button
        type="button"
        className={'dup-canon-btn' + (canon === 'mirror' ? ' active' : '')}
        onClick={() => onCanon('mirror')}
        disabled={disabled}
      >
        {c.kanonClaude}
      </button>
    </div>
  )
}

interface ReconcileButtonsProps {
  canon: Canon
  busy: boolean
  writeEnabled: boolean
  disabledTitle: string | undefined
  onPending(a: DirAction): void
}

// Paar-Reconcile (Übernehmen / Behalten), spiegelbildlich je canon-Richtung.
export function ReconcileButtons({ canon, busy, writeEnabled, disabledTitle, onPending }: ReconcileButtonsProps) {
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const dis = busy || !writeEnabled
  // canon='trunk': Shared ueberlebt -> Uebernehmen=adopt-mirror, Behalten=keep-trunk.
  // canon='mirror': Claude ueberlebt -> Uebernehmen=adopt-trunk, Behalten=keep-mirror.
  const adopt = canon === 'trunk' ? 'adopt-mirror' : 'adopt-trunk'
  const keep = canon === 'trunk' ? 'keep-trunk' : 'keep-mirror'
  const adoptLbl = canon === 'trunk' ? UEBERNEHMEN(seite) : UEBERNEHMEN_TRUNK(seite)
  const keepLbl = canon === 'trunk' ? BEHALTEN(seite) : BEHALTEN_MIRROR(seite)
  return (
    <>
      <button type="button" className="dup-btn adopt" onClick={() => onPending(adopt)} disabled={dis} title={disabledTitle ?? adoptLbl.wirkung}>
        {Icon.arrow}
        {adoptLbl.titel}
      </button>
      <button type="button" className="dup-btn keep" onClick={() => onPending(keep)} disabled={dis} title={disabledTitle ?? keepLbl.wirkung}>
        {Icon.archive}
        {keepLbl.titel}
      </button>
    </>
  )
}

interface OrdnerButtonsProps {
  name: string
  n: number
  busy: boolean
  writeEnabled: boolean
  disabledTitle: string | undefined
  onPending(a: DirAction): void
  onMoveTo(v: string): void
}

// Ganz-Ordner-Aktionen (verschieben/archivieren der Claude-Kopie, mit Datei-Zähler).
export function OrdnerButtons({ name, n, busy, writeEnabled, disabledTitle, onPending, onMoveTo }: OrdnerButtonsProps) {
  const dis = busy || !writeEnabled
  const verschieben = labelOrdnerAktion('verschieben', name, n)
  const archivieren = labelOrdnerAktion('archivieren', name, n)
  return (
    <>
      <button type="button" className="dup-btn" onClick={() => { onPending('move-mirror'); onMoveTo('') }} disabled={dis} title={disabledTitle ?? verschieben.sub}>
        {Icon.arrow}
        {verschieben.titel}
      </button>
      <button type="button" className="dup-btn" onClick={() => onPending('archive-mirror')} disabled={dis} title={disabledTitle ?? archivieren.sub}>
        {Icon.archive}
        {archivieren.titel}
      </button>
    </>
  )
}
