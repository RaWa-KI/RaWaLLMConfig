import { useState, type ReactNode } from 'react'
import type { DiffLabels, DiffLine, DirFileEntry } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { SECRET_PAAR } from '@shared/dup-labels'
import { DiffColumn, MaskedBadge, buildFallbackLines } from './diff-shared'
import { MergeEditor } from './MergeEditor'
import { OrphanActions, type DirBases } from './DirOrphanActions'
import type { OrphanFolderCtx } from './DirOrphanFolder'
import { buildKnownPaths } from './known-paths'
import { useStore } from '../../state/store'
import { useDrillContent, useDrillPair } from './use-drill-content'

// Innendatei-Drilldowns fuer den Ordner-Vergleich (HR27-Split aus DirDiffView.tsx).
// Jede innenliegende Datei eines Ordner-Paars ist aufklappbar:
//   - 'diff'        -> editierbare MergeView (MergeEditor, write-gated)
//   - 'same'        -> beide Seiten read-only + optionaler gated Einzel-Edit (MergeEditor)
//   - 'trunk-only'/'mirror-only' -> vorhandene Seite + gated Einzel-Edit
//        + Uebernehmen/Archivieren ueber BESTEHENDE gated Routen (DirOrphanActions)
// Inhalt kommt on-demand via useDrillContent/useDrillPair (readFull, NIE reveal);
// masked-Response -> maskierte Anzeige + Badge. Schreiben laeuft ausschliesslich
// ueber useWriteConfig -> backup-first; bei OFF disabled + Tooltip.

// DirBases wird in DirOrphanActions definiert; hier re-exportiert, damit
// DirDiffView den Typ unveraendert aus DirFileDrill importieren kann.
export type { DirBases }

// fileCount = Anzahl Dateien im Ordner-Paar (dir.files.length) — wird vom Parent
// (DirFileRow) durchgereicht, damit der „Mehr …"-Ordnerblock „mit N Dateien"
// ehrlich beziffern kann. Ohne Wiring faellt der Einseiter auf 1 zurueck (die
// gedrillte Datei selbst), nie auf 0.
export function DirFileDrill({
  f,
  labels,
  bases,
  fileCount
}: {
  f: DirFileEntry
  labels: DiffLabels
  bases: DirBases
  fileCount?: number
}) {
  if (f.status === 'diff') return <DirDiffDrill f={f} labels={labels} />
  if (f.status === 'same') return <DirSameDrill f={f} labels={labels} />
  return <DirSingleDrill f={f} labels={labels} bases={bases} fileCount={fileCount} />
}

// 'diff': beide Seiten laden, dann editierbare CodeMirror-MergeView rendern.
// Schreibmodus-Gate sitzt im MergeEditor (read-only ohne writeEnabled).
// Bei maskiertem Inhalt (Secret-Klasse) wird NICHT editiert — stattdessen
// read-only Side-by-side + Badge, damit kein maskierter Text zurueckgeschrieben wird.
function DirDiffDrill({ f, labels }: { f: DirFileEntry; labels: DiffLabels }) {
  const c = useDrillPair(f.trunkPath ?? '', f.mirrorPath ?? '')
  if (c.state === 'loading') return <div className="diff-loading">Lade Inhalt …</div>
  if (c.state === 'protected' || c.trunk === null || c.mirror === null)
    return <div className="diff-protected">geschützt oder nicht lesbar</div>
  if (c.masked) {
    const lines = buildFallbackLines(c.trunk, c.mirror)
    return (
      <div className="dir-drill">
        <DrillBadgeRow masked maskedCount={c.maskedCount} />
        <div className="diff-cols">
          <DiffColumn side="trunk" head={labels.trunk} tag={labels.trunkTag} path={f.trunkPath ?? ''} lines={lines} />
          <DiffColumn side="mirror" head={labels.mirror} tag={labels.mirrorTag} path={f.mirrorPath ?? ''} lines={lines} />
        </div>
      </div>
    )
  }
  return (
    <MergeEditor
      trunkPath={f.trunkPath ?? ''}
      mirrorPath={f.mirrorPath ?? ''}
      initialTrunk={c.trunk}
      initialMirror={c.mirror}
    />
  )
}

// 'same': beide Seiten nebeneinander (identischer Inhalt), non-secret aufklappbar.
// Plus optionaler gated Einzel-Edit (MergeEditor auf beide identische Seiten).
function DirSameDrill({ f, labels }: { f: DirFileEntry; labels: DiffLabels }) {
  const c = useDrillContent(f.trunkPath ?? f.mirrorPath ?? '')
  const [edit, setEdit] = useState(false)
  if (c.state === 'loading') return <div className="diff-loading">Lade Inhalt …</div>
  if (c.state === 'protected' || c.content === null)
    return <div className="diff-protected">geschützt oder nicht lesbar</div>
  // Edit-Zugang nur sinnvoll bei nicht-maskiertem Inhalt (kein Secret-Edit-Round-Trip).
  if (edit && !c.masked) {
    return (
      <MergeEditor
        trunkPath={f.trunkPath ?? ''}
        mirrorPath={f.mirrorPath ?? f.trunkPath ?? ''}
        initialTrunk={c.content}
        initialMirror={c.content}
      />
    )
  }
  return (
    <div className="dir-drill">
      <DrillBadgeRow masked={c.masked} maskedCount={c.maskedCount}>
        {!c.masked && <EditToggle open={edit} onToggle={() => setEdit((v) => !v)} />}
      </DrillBadgeRow>
      <div className="diff-cols">
        <DiffColumn side="trunk" head={labels.trunk} tag={labels.trunkTag} path={f.trunkPath ?? ''} lines={sameLines(c.content)} />
        <DiffColumn side="mirror" head={labels.mirror} tag={labels.mirrorTag} path={f.mirrorPath ?? ''} lines={sameLines(c.content)} />
      </div>
    </div>
  )
}

// Beide Seiten identisch: alle Zeilen als ctx (both) anzeigen.
function sameLines(content: string): DiffLine[] {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((_, i, a) => i < a.length - 1 || a[i] !== '')
    .map((l) => ({ l, t: 'ctx' as const, both: true }))
}

// 'trunk-only'/'mirror-only': nur die vorhandene Seite read-only anzeigen,
// plus gated Einzel-Edit + Uebernehmen/Archivieren ueber bestehende Routen.
function DirSingleDrill({
  f,
  labels,
  bases,
  fileCount
}: {
  f: DirFileEntry
  labels: DiffLabels
  bases: DirBases
  fileCount?: number
}) {
  const trunkSide = f.status === 'trunk-only'
  const path = (trunkSide ? f.trunkPath : f.mirrorPath) ?? ''
  const c = useDrillContent(path)
  const folder = useFolderCtx(trunkSide, bases, fileCount)
  const [edit, setEdit] = useState(false)
  if (c.state === 'loading') return <div className="diff-loading">Lade Inhalt …</div>
  if (c.state === 'protected' || c.content === null)
    return <div className="diff-protected">geschützt oder nicht lesbar</div>
  const lines = buildFallbackLines(c.content, c.content).filter((l) => l.both)
  const head = trunkSide ? labels.trunk : labels.mirror
  const tag = trunkSide ? labels.trunkTag : labels.mirrorTag
  // Edit-Zugang: vorhandene Seite editieren (gated MergeEditor mit gleichem Inhalt).
  if (edit && !c.masked) {
    return <MergeEditor trunkPath={path} mirrorPath={path} initialTrunk={c.content} initialMirror={c.content} />
  }
  return (
    <div className="dir-drill">
      <DrillBadgeRow masked={c.masked} maskedCount={c.maskedCount}>
        {!c.masked && <EditToggle open={edit} onToggle={() => setEdit((v) => !v)} />}
        <OrphanActions f={f} bases={bases} masked={c.masked} folder={folder} />
      </DrillBadgeRow>
      <div className="diff-cols">
        <DiffColumn side={trunkSide ? 'trunk' : 'mirror'} head={head} tag={tag} path={path} lines={lines} />
        <div className="diff-col missing">
          <div className="diff-col-head">{trunkSide ? labels.mirror : labels.trunk}</div>
          <div className="diff-body dir-missing">(fehlt)</div>
        </div>
      </div>
    </div>
  )
}

// Letztes Pfad-Segment eines Ordnerpfads (Trenner '/' oder '\') als Anzeigename.
function folderName(path: string): string {
  const clean = path.replace(/[\\/]+$/, '')
  const i = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
  return i >= 0 ? clean.slice(i + 1) : clean
}

// Folder-Kontext fuer die Einseiter-Aktionen (Verschieben + „Mehr …"-Ordnerblock):
// echte Seite + echter Ordnerpfad aus bases, Name daraus, bekannte Zielpfade aus
// dem Store (wie DirDiffView). fileCount kommt vom Parent (dir.files.length);
// fehlt das Wiring, mindestens 1 (die gedrillte Datei), nie 0/irrefuehrend.
function useFolderCtx(trunkSide: boolean, bases: DirBases, fileCount?: number): OrphanFolderCtx {
  const { config, ui } = useStore()
  const side: 'shared' | 'claude' = trunkSide ? 'shared' : 'claude'
  const folderPath = trunkSide ? bases.trunkBase : bases.mirrorBase
  return {
    side,
    folderPath,
    folderName: folderName(folderPath),
    fileCount: fileCount ?? 1,
    knownPaths: buildKnownPaths(config.data, ui.llm, '')
  }
}

// Gemeinsame Badge-/Aktionsleiste ueber einem Drilldown (masked-Badge + slots).
// Bei maskiertem (Secret-classed) Inhalt zusaetzlich „geschützt — nur Anzeige"
// (SECRET_PAAR.badge) + Grund-Tooltip: der Drilldown ist read-only NUR-Anzeige,
// die durchgereichten Aktionen (OrphanActions) sind dann ohnehin gesperrt.
function DrillBadgeRow({
  masked,
  maskedCount,
  children
}: {
  masked: boolean
  maskedCount: number
  children?: ReactNode
}) {
  return (
    <div className="dir-drill-bar">
      {masked && <MaskedBadge count={maskedCount} />}
      {masked && (
        <span className="dir-secret-badge" title={SECRET_PAAR.grundAnzeige}>
          {Icon.key}
          {SECRET_PAAR.badge}
        </span>
      )}
      {children}
    </div>
  )
}

// Einzel-Edit-Umschalter (oeffnet/schliesst den gated MergeEditor).
function EditToggle({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <button type="button" className="dir-drill-btn" onClick={onToggle}>
      {Icon.edit}
      {open ? 'Editor schließen' : 'Bearbeiten'}
    </button>
  )
}
