import { useState } from 'react'
import type { DirCompare, DirFileEntry, DirFileStatus, DiffLabels } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { PILL, SECRET_PAAR } from '@shared/dup-labels'
import { DirFileDrill, type DirBases } from './DirFileDrill'
import { DupRowActions } from './DupRowActions'
import { DupRowRename } from './DupRowRename'

// HR27-Split aus DirDiffView.tsx: die innere Klappebene (Datei-Tabelle) eines
// Ordner-Paars nach Mockup v4 (§Eintrag/Datei-Zeilen).
//
// Struktur je Datei-Zeile (v4 .dir-file / .dir-file-head):
//   [Chevron] [Pill "Datei"] [Dateiname mono] [Status-Pill] [Aktions-Slots]
// Status-Pill-Texte kommen zentral aus shared/dup-labels.ts (PILL). KEINE
// Null-Wert-Pills (Owner-Entscheid). Aktions-Slots sind v4-Platzhalter
// (Bearbeiten/Stift, Verschieben, Mehr) mit stabilen Klassen; die konkreten
// Komponenten RenameInline/MoveDialog verdrahtet ein Folge-Agent (WP-08).

// Status -> sichtbare Pill-Texte (Owner: keine Trunk/Mirror-Begriffe sichtbar).
// 'trunk-only'/'mirror-only' werden seitenbezogen ueber labels aufgeloest, damit
// die Zeile „nur Shared" bzw. „nur Claude" zeigt statt Code-interner Seitennamen.
function statusPill(f: DirFileEntry, labels: DiffLabels): { text: string; cls: string } {
  switch (f.status) {
    case 'same':
      return { text: PILL.same, cls: 'same' }
    case 'diff':
      return { text: PILL.diff, cls: 'diff' }
    case 'trunk-only':
      return { text: `${PILL.only} (${labels.trunk})`, cls: 'trunk-only' }
    case 'mirror-only':
      return { text: `${PILL.only} (${labels.mirror})`, cls: 'mirror-only' }
    default:
      return { text: PILL.diff, cls: 'diff' }
  }
}

// Letztes Pfad-Segment als Anzeige-/Umbenennen-Basisname (Trenner '/' oder '\').
function baseName(rel: string): string {
  const parts = rel.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || rel
}

// Eine Datei-Zeile (v4 .dir-file). Chevron + „Datei"-Pill + Name + Status-Pill
// links auf dem Toggle-Button; Aktions-Slots rechts ausserhalb des Toggles, damit
// ein Slot-Klick nicht die Zeile auf-/zuklappt. secret-Zeilen (gemischter Ordner):
// SICHTBAR „geschützt — übersprungen" (SECRET_PAAR.uebersprungen) + Grund statt
// Aktionen — kein stiller Pro-Datei-Skip (Reconcile mappt sie auf 'secret-skip').
// 'trunk-only' = nur Shared, 'mirror-only' = nur Claude — die jeweils fehlende
// Seite bekommt keinen Pfad (Seitenwahl blendet sie aus).
export function DirFileRow({
  f,
  labels,
  bases,
  knownPaths,
  fileCount,
  open,
  onToggle
}: {
  f: DirFileEntry
  labels: DiffLabels
  bases: DirBases
  knownPaths: string[]
  fileCount?: number
  open: boolean
  onToggle(rel: string): void
}) {
  const [renaming, setRenaming] = useState(false)
  // secret-bearing: niemals aufklappbar (kein Inhalts-Drilldown). Alle anderen
  // Eintraege sind aufklappbar — auch 'same' (Owner soll Inhalt sehen koennen).
  const expandable = !f.secret
  const name = baseName(f.rel)
  return (
    <div className={'dir-file' + (open ? ' open' : '')}>
      <div className="dir-file-row">
        {renaming ? (
          <DupRowRename currentName={name} sharedPath={f.trunkPath} claudePath={f.mirrorPath} kind="Datei" onDone={() => setRenaming(false)} />
        ) : (
          <DirFileHead
            f={f}
            labels={labels}
            name={name}
            knownPaths={knownPaths}
            open={open}
            onToggle={onToggle}
            onStartRename={() => setRenaming(true)}
          />
        )}
      </div>
      {f.secret && (
        <div className="dir-secret-hint" title={SECRET_PAAR.grundUebersprungen}>
          {SECRET_PAAR.grundUebersprungen}
        </div>
      )}
      {expandable && open && <DirFileDrill f={f} labels={labels} bases={bases} fileCount={fileCount} />}
    </div>
  )
}

// Datei-Zeilen-Kopf (Toggle) + Aktions-Slots (nicht beim Umbenennen). secret-
// Zeilen: Aktions-Slot zeigt SICHTBAR „Änderungen nicht möglich" statt zu
// verschwinden (kein stiller Skip), Toggle deaktiviert (kein Drilldown).
interface DirFileHeadProps {
  f: DirFileEntry
  labels: DiffLabels
  name: string
  knownPaths: string[]
  open: boolean
  onToggle(rel: string): void
  onStartRename(): void
}

function DirFileHead({ f, labels, name, knownPaths, open, onToggle, onStartRename }: DirFileHeadProps) {
  const pill = statusPill(f, labels)
  const expandable = !f.secret
  return (
    <>
      <button
        type="button"
        className="dir-file-head"
        onClick={expandable ? () => onToggle(f.rel) : undefined}
        disabled={!expandable}
        aria-expanded={expandable ? open : false}
      >
        {expandable ? (
          <span className={'dir-chev' + (open ? ' open' : '')}>{Icon.chev}</span>
        ) : (
          <span className="dir-chev placeholder" aria-hidden="true" />
        )}
        <span className="dir-file-level">Datei</span>
        <span className="dir-rel mono">{f.rel}</span>
        {f.secret ? (
          <span className="dir-badge secret" title={SECRET_PAAR.grundUebersprungen}>
            {Icon.key}
            {SECRET_PAAR.uebersprungen}
          </span>
        ) : (
          <span className={'dir-badge ' + pill.cls}>{pill.text}</span>
        )}
      </button>
      {f.secret ? (
        // Kein stiller Skip: secret-Datei zeigt sichtbar, dass Aktionen gesperrt sind
        // (Reconcile mappt sie pro Datei auf 'secret-skip' — nie unbemerkt).
        <span className="dfh-actions dir-secret-locked" title={SECRET_PAAR.grundUebersprungen}>
          {SECRET_PAAR.aktionGesperrt}
        </span>
      ) : (
        <DupRowActions
          name={name}
          kind="Datei"
          sharedPath={f.trunkPath}
          claudePath={f.mirrorPath}
          knownPaths={knownPaths}
          onStartRename={onStartRename}
        />
      )}
    </>
  )
}

// Ordner-Zusammenfassung (v4 .dir-summary): farbige Zaehl-Badges. Owner-Entscheid:
// KEINE Null-Wert-Badges — nur Kategorien mit count > 0 werden gezeigt. Der
// N-Dateien-Zaehler nutzt files.length; bei truncated EHRLICH gekennzeichnet.
export function DirSummary({ dir, labels }: { dir: DirCompare; labels: DiffLabels }) {
  const badges: { count: number; cls: string; text: string }[] = [
    { count: dir.sameCount, cls: 'same', text: `${dir.sameCount} ${PILL.same}` },
    { count: dir.diffCount, cls: 'diff', text: `${dir.diffCount} ${PILL.diff}` },
    { count: dir.trunkOnlyCount, cls: 'trunk-only', text: `${dir.trunkOnlyCount} ${PILL.only} (${labels.trunk})` },
    { count: dir.mirrorOnlyCount, cls: 'mirror-only', text: `${dir.mirrorOnlyCount} ${PILL.only} (${labels.mirror})` }
  ]
  const shown = dir.files.length
  return (
    <div className="dir-summary">
      <span className="dir-count">{shown === 1 ? '1 Datei' : `${shown} Dateien`}</span>
      {badges
        .filter((b) => b.count > 0)
        .map((b) => (
          <span key={b.cls} className={'dir-badge ' + b.cls}>
            {b.text}
          </span>
        ))}
      {dir.truncated && (
        <span className="dir-truncated">
          {Icon.note}Liste gekürzt — nur {shown} von mehr Dateien gezeigt (Sicherheitsgrenze)
        </span>
      )}
    </div>
  )
}

export type { DirFileStatus }
