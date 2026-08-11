import type { ReactNode } from 'react'
import type { DirCompare, DuplicateSet } from '@shared/contract'
import { Icon } from '../../components/Icon'
import {
  CONFIRM,
  SICHERUNG,
  VERSCHIEBEN,
  seiteForFamily,
  intraAktionTexte,
  isIntraFamilyDup
} from '@shared/dup-labels'
import { actionTitle, actionDesc } from './dir-confirm-texts'
import type { ConfirmTexte, DirAction } from './dir-confirm-texts'
import { useStore } from '../../state/store'

// DirConfirmBlock + DirFileDecisions — aus DirReconcileActions.tsx extrahiert (HR27-Split).
// Zeigt den Bestätigungs-Dialog für eine Ordner-Aktion, inkl. Pro-Datei-Entscheidung.
// Beim Verschieben gibt es KEIN Zielpfad-Feld mehr (Finding A): das Ziel wählt der
// Nutzer beim Bestätigen im nativen System-Ordnerdialog (Main-Prozess). Sichtbare
// Texte ausschliesslich aus @shared/dup-labels
// (Quelle→Ziel→Wirkung, Sprach-Anker Shared/Claude — Trunk/Mirror/Merge sind raus).
// Code-interne Aktions-Typnamen (keep-trunk, …) bleiben unverändert.
// Welle 1: seite wird lokal via seiteForFamily(ui.llm) abgeleitet, alle seite-
// nennenden Texte (actionTitle/actionDesc/CONFIRM) nutzen die echte Seite.
// Intra-Familien-Paare (isIntraFamilyDup): ehrliche Fassungs-Texte (Fundstelle
// A/B) statt „Shared"/„deine Kopie" — nur Beschriftung, Flow unveraendert.

// Aktions-Typ + Confirm-Textsatz liegen in dir-confirm-texts.ts (HR27-Split);
// hier re-exportiert, damit die bestehenden Importe unveraendert bleiben.
export type { DirAction } from './dir-confirm-texts'

export type DirFileDecisionValue =
  | 'keep-trunk'
  | 'keep-mirror'
  | 'adopt-mirror'
  | 'adopt-trunk'
  | 'skip'

export interface DirDecisions {
  [rel: string]: DirFileDecisionValue
}

interface DirConfirmProps {
  d: DuplicateSet
  dir: DirCompare
  action: DirAction
  decisions: DirDecisions
  onDecision(rel: string, dec: DirFileDecisionValue): void
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  onCancel(): void
  onConfirm(): void
  // Plan-Vorschau des Ordner-Merges (Zwei-Klick): erst nach dem Pruef-Klick
  // gefuellt, sonst leer. Reine Anzeige — der Block bringt keine eigene Logik mit.
  planBlock?: ReactNode
  // Wortlaut des Bestaetigen-Knopfs; ohne Wert der Bestand aus CONFIRM.
  confirmLabel?: string
  // Zusaetzliche Sperre (z.B. Blocker im Plan) zur Standard-Pruefung.
  confirmBlocked?: boolean
  // Fortschrittsanzeige des laufenden Speicherns (reine Anzeige, kein State hier).
  progressBlock?: ReactNode
}

// Reconcile-Aktionen (Pro-Datei-Entscheidungen sichtbar): alle vier Richtungen.
const MERGE_ACTIONS: ReadonlyArray<DirAction> = ['keep-trunk', 'keep-mirror', 'adopt-mirror', 'adopt-trunk']

export function DirConfirmBlock(props: DirConfirmProps) {
  const { d, dir, action, decisions, onDecision } = props
  const { busy, writeEnabled, writeReason, onCancel, onConfirm } = props
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  // Intra-Familien-Paar: ehrliche Fassungs-Texte statt Shared/Kopie (nur Texte).
  const intra = isIntraFamilyDup(d, ui.llm) ? intraAktionTexte(d.trunk.path, d.mirror.path) : null
  const c = intra ? intra.confirm : CONFIRM(seite)
  const isMerge = MERGE_ACTIONS.includes(action)
  const isMove = action === 'move-dir' || action === 'move-mirror'
  // Beim Verschieben kein Zielpfad-Feld mehr -> keine moveTo-Sperre (Finding A).
  const confirmDisabled = busy || !writeEnabled || !!props.confirmBlocked
  // Verschieben-Knopf sagt, dass gleich der System-Ordnerdialog aufgeht.
  const confirmLabel = props.confirmLabel ?? (isMove ? VERSCHIEBEN.ordnerKnopf : undefined)

  return (
    <div className="dup-confirm">
      <div className="dup-confirm-title">
        {Icon.warn}
        {actionTitle(action, d.name, seite, c, intra)}
      </div>
      <p className="dup-confirm-text">{actionDesc(action, seite, c, intra)}</p>
      <ConfirmPaths d={d} c={c} />
      {isMove && (
        <div className="dup-confirm-hint dir-move-hint">
          {Icon.note}
          {VERSCHIEBEN.ordnerDialogHinweis}
        </div>
      )}
      {isMerge && <DirFileDecisions dir={dir} decisions={decisions} onDecision={onDecision} c={c} />}
      {props.planBlock}
      <div className="dup-confirm-hint">
        {Icon.snap}
        {SICHERUNG.snapshot}
      </div>
      {props.progressBlock}
      <ConfirmButtons
        busy={busy}
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        confirmDisabled={confirmDisabled}
        onCancel={onCancel}
        onConfirm={onConfirm}
        c={c}
        confirmLabel={confirmLabel}
      />
    </div>
  )
}

// Pfad-Zeilen mit Sprach-Anker statt Trunk/Spiegel (Intra: Fundstelle A/B).
function ConfirmPaths({ d, c }: { d: DuplicateSet; c: ConfirmTexte }) {
  return (
    <div className="dup-confirm-paths mono">
      <div>
        {c.pfadShared}: {d.trunk.path}
      </div>
      <div>
        {c.pfadClaude}: {d.mirror.path}
      </div>
    </div>
  )
}

interface ConfirmButtonsProps {
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  confirmDisabled: boolean
  onCancel(): void
  onConfirm(): void
  c: ConfirmTexte
  confirmLabel?: string
}

function ConfirmButtons({
  busy,
  writeEnabled,
  writeReason,
  confirmDisabled,
  onCancel,
  onConfirm,
  c,
  confirmLabel
}: ConfirmButtonsProps) {
  const disabledTitle = !writeEnabled ? (writeReason ?? c.bestaetigen) : undefined
  return (
    <div className="dup-confirm-btns">
      <button type="button" className="dup-btn" onClick={onCancel} disabled={busy}>
        {Icon.x}
        {c.abbrechen}
      </button>
      <button
        type="button"
        className="dup-btn adopt"
        onClick={onConfirm}
        disabled={confirmDisabled}
        title={disabledTitle}
      >
        {Icon.check}
        {busy ? c.arbeitet : (confirmLabel ?? c.bestaetigen)}
      </button>
    </div>
  )
}

interface DirFileDecisionsProps {
  dir: DirCompare
  decisions: DirDecisions
  onDecision(rel: string, dec: DirFileDecisionValue): void
  c: ConfirmTexte
}

// Symmetrische Pro-Datei-Optionen (Finding B): beide Seiten behalten/uebernehmen.
const DEC_OPTIONS: ReadonlyArray<DirFileDecisionValue> = [
  'keep-trunk',
  'keep-mirror',
  'adopt-mirror',
  'adopt-trunk',
  'skip'
]

function DirFileDecisions({ dir, decisions, onDecision, c }: DirFileDecisionsProps) {
  // Auch IDENTISCHE Dateien sind entscheidbar: ein Duplikat-Ordner wird auch bei
  // gleichem Inhalt dedupliziert (Verliererseite archiviert). Nur Secret bleibt aussen.
  const actionable = dir.files.filter((f) => !f.secret)
  if (actionable.length === 0) {
    return <p className="dir-file-dec-empty">{c.proDateiLeer}</p>
  }
  return (
    <div className="dir-file-dec-list">
      <div className="dir-file-dec-head">{c.proDateiKopf}:</div>
      {actionable.map((f) => (
        <div key={f.rel} className="dir-file-dec-row">
          <span className="dir-rel mono">{f.rel}</span>
          <span className="dir-file-dec-status">{statusLabel(f.status)}</span>
          <div className="dir-file-dec-btns">
            {DEC_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                className={'dir-dec-btn' + (decisions[f.rel] === opt ? ' active' : '')}
                onClick={() => onDecision(f.rel, opt)}
              >
                {decLabel(opt, c)}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function decLabel(opt: DirFileDecisionValue, c: ConfirmTexte): string {
  switch (opt) {
    case 'keep-trunk':
      return c.decShared
    case 'keep-mirror':
      return c.decClaudeBehalten
    case 'adopt-mirror':
      return c.decClaude
    case 'adopt-trunk':
      return c.decSharedUebernehmen
    default:
      return c.decSkip
  }
}

function statusLabel(status: string): string {
  if (status === 'same') return 'identisch'
  if (status === 'diff') return 'unterschiedlich'
  return 'nur einseitig'
}
