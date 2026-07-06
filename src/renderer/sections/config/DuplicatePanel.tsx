import { useMemo, useState } from 'react'
import type { Category, DiffLabels, DuplicateSet } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { SEITE, PILL, diffLabels, seiteForFamily } from '@shared/dup-labels'
import { buildKnownPaths } from './known-paths'
import { folderPathOf } from './manifest-path'
import { DirDiffView } from './DirDiffView'
import { DupRowActions } from './DupRowActions'
import { DupRowRename } from './DupRowRename'
import { FilePairEntry } from './DuplicateFilePair'
import { LoadHintBadge } from '../compare/LoadHintBadge'
import './DuplicatePanel.css'

// DuplicatePanel (WP-06 Teil B) — Eintrags-Ebene exakt nach Mockup v4.
// Die Duplikatliste ist eine Liste klappbarer Eintraege (Skill = Ordner, v4
// .dup-entry): Kopfzeile mit Name, Familien-Chips (Shared/Claude), Typ + Datei-
// Zaehler und Verdikt-Badge; Aufklappen zeigt den Eintrags-Koerper.
// Ordner-Dubletten (d.dir): Koerper = DirDiffView (Teil A: Summary + Datei-
// Tabelle + Ordner-Aktionen, unveraendert). Einzeldatei-Paare werden als Datei-
// Tabelle mit EINER Zeile einsortiert (Owner-Entscheid: einheitlicher Aufbau).
// Sichtbare Texte ausschliesslich aus shared/dup-labels.ts; Trunk/Mirror/Merge/M2
// sind im UI verboten. Schreib-Aktionen bleiben write-gated + Confirm-pflichtig.
// Einzeldatei-Paar-Rendering liegt im HR27-Split DuplicateFilePair.tsx (WP-10).

export function DuplicatePanel({ dups, labels, cat }: { dups: DuplicateSet[]; labels?: DiffLabels; cat: Category }) {
  // Alle Duplikate anzeigen (Shared-Seite kuenftig via CoverageView — WP-04).
  const shown = dups
  if (dups.length === 0) {
    return (
      <div className="dup-panel">
        <div className="empty">
          {Icon.check}
          <p>Keine Duplikate in dieser Kategorie.</p>
        </div>
      </div>
    )
  }
  // v4: der erste Eintrag startet aufgeklappt, der Rest zugeklappt.
  return (
    <div className="dup-panel">
      {shown.map((d, i) => (
        <DupEntry key={d.cat + '/' + d.name + '/' + d.mirrorFamily} d={d} labels={labels} cat={cat} startOpen={i === 0} />
      ))}
    </div>
  )
}

// Ein klappbarer Eintrag (v4 .dup-entry). Kopf zeigt Name + Familien-Chips +
// Typ/Zaehler + Verdikt-Badge + Eintrags-Aktionen (Stift/Verschieben/Mehr);
// Koerper wird je nach Dublettentyp aufgebaut. Bei Ordner-Dubletten beziehen sich
// die Eintrags-Aktionen auf den GANZEN Ordner (kind='Ordner', mit Datei-Zaehler).
function DupEntry({ d, labels, cat, startOpen }: { d: DuplicateSet; labels?: DiffLabels; cat: Category; startOpen: boolean }) {
  const { ui } = useStore()
  const [open, setOpen] = useState(startOpen)
  const [renaming, setRenaming] = useState(false)
  // FALLBACK aus der ECHTEN Seite (Familie → Seite), falls der Aufrufer keine
  // diffLabels durchreicht: Shared gegen die jeweilige lokale Kopie statt fest Claude.
  const seite = seiteForFamily(ui.llm)
  return (
    <div className={'dup-entry' + (open ? ' open' : '')}>
      <DupEntryHead
        d={d}
        cat={cat}
        open={open}
        renaming={renaming}
        onToggle={() => setOpen((v) => !v)}
        onStartRename={() => setRenaming(true)}
        onDoneRename={() => setRenaming(false)}
      />
      {open && (
        <div className="dup-entry-body">
          {d.dir ? <DirDiffView d={d} labels={labels ?? diffLabels(seite)} /> : <FilePairEntry d={d} labels={labels} />}
        </div>
      )}
    </div>
  )
}

// Eintrags-Kopf (v4 .dup-entry-head): Toggle-Button + Eintrags-Aktionen. Bei
// aktivem Inline-Umbenennen ersetzt RenameInline den Kopf (kein toter Toggle).
// Ordner-Eintraege: Aktionen meinen den GANZEN Ordner (kind='Ordner' + Zaehler).
interface DupEntryHeadProps {
  d: DuplicateSet
  cat: Category
  open: boolean
  renaming: boolean
  onToggle(): void
  onStartRename(): void
  onDoneRename(): void
}

function DupEntryHead({ d, cat, open, renaming, onToggle, onStartRename, onDoneRename }: DupEntryHeadProps) {
  const { config, ui } = useStore()
  const knownPaths = useMemo(() => buildKnownPaths(config.data, ui.llm, ''), [config.data, ui.llm])
  const fileCount = d.dir ? d.dir.files.length : 1
  const kind = d.dir ? 'Ordner' : 'Datei'
  // Seite lokal aus der Familie ableiten (keine cross-component Prop): bestimmt
  // die echte Gegenseite der Familien-Chips (Shared ↔ Claude/Codex/Workspace).
  const seite = seiteForFamily(ui.llm)
  // Bug A: Bei ORDNER-Eintraegen (Skill/Agent) muessen die Eintrags-Kopf-Aktionen
  // den ORDNER treffen, nicht die Manifestdatei (SKILL.md/AGENT.md), auf die der
  // Set-Pfad zeigt. Manifest-Pfad -> enthaltender Ordner; Datei-Eintraege bleiben
  // unveraendert. Datei-ZEILEN (DirFileRow) reichen weiter echte Datei-Pfade.
  const sharedPath = d.dir ? folderPathOf(d.trunk.path) : d.trunk.path
  const claudePath = d.dir ? folderPathOf(d.mirror.path) : d.mirror.path
  if (renaming) {
    return (
      <div className="dup-entry-head dup-entry-renaming">
        <span className={'chev-btn' + (open ? ' open' : '')}>{Icon.chev}</span>
        <span className="deh-icon">{d.dir ? Icon[cat.icon] : Icon.diff}</span>
        <DupRowRename currentName={d.name} sharedPath={sharedPath} claudePath={claudePath} kind={kind} onDone={onDoneRename} />
      </div>
    )
  }
  return (
    <div className="dup-entry-head-row">
      <button type="button" className="dup-entry-head" onClick={onToggle} aria-expanded={open}>
        <span className={'chev-btn' + (open ? ' open' : '')}>{Icon.chev}</span>
        <span className="deh-icon">{d.dir ? Icon[cat.icon] : Icon.diff}</span>
        <span className="deh-main">
          <span className="deh-name">
            <span className="deh-fname mono">{d.name}</span>
            <LoadHintBadge path={d.trunk.path} />
            <FamilyChips seite={seite} />
          </span>
          <span className="deh-desc">{entryType(d, fileCount, cat)}</span>
        </span>
        <span className="deh-meta">
          <VerdictBadge d={d} fileCount={fileCount} />
        </span>
      </button>
      <DupRowActions
        name={d.name}
        kind={kind}
        fileCount={d.dir ? fileCount : undefined}
        sharedPath={sharedPath}
        claudePath={claudePath}
        knownPaths={knownPaths}
        onStartRename={onStartRename}
      />
    </div>
  )
}

// Familien-Chips (Sprach-Anker Shared/<echte Seite>). Texte zentral aus
// dup-labels.ts — machen die zwei verglichenen Seiten im Kopf direkt sichtbar.
// Die Gegenseite folgt der echten Familie (Claude/Codex/Workspace), nicht fest Claude.
function FamilyChips({ seite }: { seite: 'claude' | 'codex' | 'workspace' }) {
  return (
    <span className="deh-fams">
      <span className="deh-fam shared">{SEITE.shared}</span>
      <span className={'deh-fam ' + seite}>{SEITE[seite]}</span>
    </span>
  )
}

// Typ-/Zaehler-Text im Kopf: „<Kategorie> · Ordner · N Dateien" bzw.
// „<Kategorie> · Datei". Kategorie-Wahrheit aus cat.label statt fest „Skill".
function entryType(d: DuplicateSet, fileCount: number, cat: Category): string {
  if (!d.dir) return `${cat.label} · Datei`
  const dateien = fileCount === 1 ? '1 Datei' : `${fileCount} Dateien`
  return `${cat.label} · Ordner · ${dateien}`
}

// Verdikt-Badge im Kopf (v4 .deh-meta .pill). Owner: keine Null-Werte. Texte
// aus dup-labels.ts; bei Ordnern wird die Zahl der abweichenden Dateien gezeigt.
function VerdictBadge({ d, fileCount }: { d: DuplicateSet; fileCount: number }) {
  if (d.dir) {
    const diff = d.dir.diffCount
    if (diff > 0) return <span className="pill abw"><span className="pd" />{`${diff} ${PILL.diff} zu Shared`}</span>
    return <span className="pill same"><span className="pd" />{`${fileCount === 1 ? '1 Datei ' : ''}${PILL.same}`}</span>
  }
  const same = d.verdict === 'same'
  return (
    <span className={'pill ' + (same ? 'same' : 'abw')}>
      <span className="pd" />
      {same ? PILL.same : `${PILL.diff} zu Shared`}
    </span>
  )
}
