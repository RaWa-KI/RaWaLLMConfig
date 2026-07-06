import type { DirCompare, DuplicateSet } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { PathPicker } from './PathPicker'
import { CONFIRM, SICHERUNG, VERSCHIEBEN, seiteForFamily, ordnerConfirm } from '@shared/dup-labels'
import type { Seite } from '@shared/dup-labels'
import { useStore } from '../../state/store'

// DirConfirmBlock + DirFileDecisions — aus DirReconcileActions.tsx extrahiert (HR27-Split).
// Zeigt den Bestätigungs-Dialog für eine Ordner-Aktion, inkl. Pro-Datei-Entscheidung
// und PathPicker beim Verschieben. Sichtbare Texte ausschliesslich aus @shared/dup-labels
// (Quelle→Ziel→Wirkung, Sprach-Anker Shared/Claude — Trunk/Mirror/Merge sind raus).
// Code-interne Aktions-Typnamen (keep-trunk, …) bleiben unverändert.
// Welle 1: seite wird lokal via seiteForFamily(ui.llm) abgeleitet, alle seite-
// nennenden Texte (actionTitle/actionDesc/CONFIRM) nutzen die echte Seite.

// Reconcile-Aktionen sind symmetrisch (Finding B): keep-trunk/adopt-mirror behalten/
// uebernehmen die Shared-Seite, keep-mirror/adopt-trunk spiegeln das fuer die
// Claude-Seite. archive-/move-dir|mirror sind die Ganz-Ordner-Aktionen.
export type DirAction =
  | 'keep-trunk'
  | 'keep-mirror'
  | 'adopt-mirror'
  | 'adopt-trunk'
  | 'archive-dir'
  | 'move-dir'
  | 'archive-mirror'
  | 'move-mirror'

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
  moveTo: string
  onMoveTo(v: string): void
  knownPaths: string[]
  decisions: DirDecisions
  onDecision(rel: string, dec: DirFileDecisionValue): void
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  onCancel(): void
  onConfirm(): void
}

// Reconcile-Aktionen (Pro-Datei-Entscheidungen sichtbar): alle vier Richtungen.
const MERGE_ACTIONS: ReadonlyArray<DirAction> = ['keep-trunk', 'keep-mirror', 'adopt-mirror', 'adopt-trunk']

export function DirConfirmBlock(props: DirConfirmProps) {
  const { d, dir, action, moveTo, onMoveTo, knownPaths, decisions, onDecision } = props
  const { busy, writeEnabled, writeReason, onCancel, onConfirm } = props
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const isMerge = MERGE_ACTIONS.includes(action)
  const isMove = action === 'move-dir' || action === 'move-mirror'
  const confirmDisabled = busy || !writeEnabled || (isMove && !moveTo.trim())

  return (
    <div className="dup-confirm">
      <div className="dup-confirm-title">
        {Icon.warn}
        {actionTitle(action, d.name, seite)}
      </div>
      <p className="dup-confirm-text">{actionDesc(action, seite)}</p>
      <ConfirmPaths d={d} seite={seite} />
      {isMove && (
        <div className="dir-move-target">
          <PathPicker
            value={moveTo}
            onChange={onMoveTo}
            options={knownPaths}
            placeholder={VERSCHIEBEN.zielPlatzhalter}
          />
        </div>
      )}
      {isMerge && <DirFileDecisions dir={dir} decisions={decisions} onDecision={onDecision} seite={seite} />}
      <div className="dup-confirm-hint">
        {Icon.snap}
        {SICHERUNG.snapshot}
      </div>
      <ConfirmButtons
        busy={busy}
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        confirmDisabled={confirmDisabled}
        onCancel={onCancel}
        onConfirm={onConfirm}
        seite={seite}
      />
    </div>
  )
}

// Pfad-Zeilen mit Sprach-Anker statt Trunk/Spiegel. pfadClaude = seite-abhaengig.
function ConfirmPaths({ d, seite }: { d: DuplicateSet; seite: Seite }) {
  const c = CONFIRM(seite)
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
  seite: Seite
}

function ConfirmButtons({
  busy,
  writeEnabled,
  writeReason,
  confirmDisabled,
  onCancel,
  onConfirm,
  seite
}: ConfirmButtonsProps) {
  const c = CONFIRM(seite)
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
        {busy ? c.arbeitet : c.bestaetigen}
      </button>
    </div>
  )
}

interface DirFileDecisionsProps {
  dir: DirCompare
  decisions: DirDecisions
  onDecision(rel: string, dec: DirFileDecisionValue): void
  seite: Seite
}

// Symmetrische Pro-Datei-Optionen (Finding B): beide Seiten behalten/uebernehmen.
const DEC_OPTIONS: ReadonlyArray<DirFileDecisionValue> = [
  'keep-trunk',
  'keep-mirror',
  'adopt-mirror',
  'adopt-trunk',
  'skip'
]

function DirFileDecisions({ dir, decisions, onDecision, seite }: DirFileDecisionsProps) {
  const c = CONFIRM(seite)
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

function decLabel(opt: DirFileDecisionValue, c: ReturnType<typeof CONFIRM>): string {
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

function actionTitle(action: DirAction, name: string, seite: Seite): string {
  const c = CONFIRM(seite)
  switch (action) {
    case 'keep-trunk':
      return `${c.titelBehalten} (${name})`
    case 'keep-mirror':
      return `${c.titelBehaltenMirror} (${name})`
    case 'adopt-mirror':
      return `${c.titelUebernehmen} (${name})`
    case 'adopt-trunk':
      return `${c.titelUebernehmenTrunk} (${name})`
    case 'archive-dir':
      return ordnerConfirm('archivieren', 'shared', name).titel
    case 'move-dir':
      return ordnerConfirm('verschieben', 'shared', name).titel
    case 'archive-mirror':
      return ordnerConfirm('archivieren', seite, name).titel
    case 'move-mirror':
      return ordnerConfirm('verschieben', seite, name).titel
  }
}

function actionDesc(action: DirAction, seite: Seite): string {
  const c = CONFIRM(seite)
  switch (action) {
    case 'keep-trunk':
      return c.textBehalten
    case 'keep-mirror':
      return c.textBehaltenMirror
    case 'adopt-mirror':
      return c.textUebernehmen
    case 'adopt-trunk':
      return c.textUebernehmenTrunk
    case 'archive-dir':
      return ordnerConfirm('archivieren', 'shared', '').text
    case 'move-dir':
      return ordnerConfirm('verschieben', 'shared', '').text
    case 'archive-mirror':
      return ordnerConfirm('archivieren', seite, '').text
    case 'move-mirror':
      return ordnerConfirm('verschieben', seite, '').text
  }
}
