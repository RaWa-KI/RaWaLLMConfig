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
  seiteForFamily,
  type IntraAktionTexte
} from '@shared/dup-labels'
import './DirReconcileButtons.css'

// DirReconcileButtons — Button-Reihen der Ordner-Aktions-Zeile (aus
// DirReconcileActions.tsx ausgelagert, HR27). SYMMETRISCH (Finding B): ein
// „Welche Version bleibt?"-Umschalter (Shared|Claude) polt die Default-/Bulk-
// Richtung um — KEIN Shared-Bias. Bei canon='trunk' wirken Uebernehmen/Behalten
// auf die Shared-Seite, bei canon='mirror' spiegelbildlich auf die Claude-Seite.
// Sichtbare Texte ausschliesslich aus @shared/dup-labels. Intra-Familien-Paare
// (beide Fundstellen derselben Familie) reichen `intra` durch und erhalten die
// ehrlichen Fassungs-Texte statt „Shared"/„deine Kopie" — nur Beschriftung,
// canon-/decision-Mechanik unveraendert.

export type Canon = 'trunk' | 'mirror'

interface CanonToggleProps {
  canon: Canon
  onCanon(c: Canon): void
  disabled: boolean
  // Optional: ehrliche Intra-Familien-Texte (Fassung A/B) statt Shared/Kopie.
  intra?: IntraAktionTexte | null
}

// Umschalter: welche Version standardmaessig ueberlebt (Shared oder Claude;
// bei Intra-Paaren Fassung A oder Fassung B).
export function CanonToggle({ canon, onCanon, disabled, intra }: CanonToggleProps) {
  const { ui } = useStore()
  const c = intra ? intra.confirm : CONFIRM(seiteForFamily(ui.llm))
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
  // Optional: ehrliche Intra-Familien-Texte (Fassung A/B) statt Shared/Kopie.
  intra?: IntraAktionTexte | null
}

// Paar-Reconcile (Übernehmen / Behalten), spiegelbildlich je canon-Richtung.
export function ReconcileButtons({ canon, busy, writeEnabled, disabledTitle, onPending, intra }: ReconcileButtonsProps) {
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const dis = busy || !writeEnabled
  // canon='trunk': Shared ueberlebt -> Uebernehmen=adopt-mirror, Behalten=keep-trunk.
  // canon='mirror': Claude ueberlebt -> Uebernehmen=adopt-trunk, Behalten=keep-mirror.
  const adopt = canon === 'trunk' ? 'adopt-mirror' : 'adopt-trunk'
  const keep = canon === 'trunk' ? 'keep-trunk' : 'keep-mirror'
  const adoptLbl = intra
    ? (canon === 'trunk' ? intra.uebernehmen : intra.uebernehmenTrunk)
    : (canon === 'trunk' ? UEBERNEHMEN(seite) : UEBERNEHMEN_TRUNK(seite))
  const keepLbl = intra
    ? (canon === 'trunk' ? intra.behalten : intra.behaltenMirror)
    : (canon === 'trunk' ? BEHALTEN(seite) : BEHALTEN_MIRROR(seite))
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
}

// Ganz-Ordner-Aktionen (verschieben/archivieren der Claude-Kopie, mit Datei-Zähler).
// Verschieben oeffnet beim Bestaetigen den nativen Main-Ordnerdialog fuer das Ziel
// (Sicherheit Finding A) — hier wird kein Ziel mehr vom Renderer gesetzt.
export function OrdnerButtons({ name, n, busy, writeEnabled, disabledTitle, onPending }: OrdnerButtonsProps) {
  const dis = busy || !writeEnabled
  const verschieben = labelOrdnerAktion('verschieben', name, n)
  const archivieren = labelOrdnerAktion('archivieren', name, n)
  return (
    <>
      <button type="button" className="dup-btn" onClick={() => onPending('move-mirror')} disabled={dis} title={disabledTitle ?? verschieben.sub}>
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
