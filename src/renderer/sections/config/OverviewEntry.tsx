import { useMemo, useState } from 'react'
import type { Category, ConfigEntry } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { buildKnownPaths } from './known-paths'
import { DupRowActions } from './DupRowActions'
import { DupRowRename } from './DupRowRename'
import { LoadInfoLine } from './LoadInfoLine'
import { OverviewEditor } from './OverviewEditor'
import { OverviewFiles } from './OverviewFiles'

// OverviewEntry — klappbarer Übersichts-Eintrag mit DUP-STANDARD (Owner-Reichweite
// 15:17: ALLE Übersichten editierbar, gleiches Verhalten wie die Dup-Ansicht).
// Pro Eintrag: Kopf (Name/Status) + Zeilenaktionen (Stift=RenameInline ·
// Verschieben=MoveDialog · Mehr…) über DupRowActions/DupRowRename — WIEDERVERWENDET.
//
// Aufklappen unterscheidet ORDNER vs. EINZELDATEI (v4 §view-ov):
//   - Ordner-Eintrag (Skill = Verzeichnis): Liste ALLER Innendateien via
//     OverviewFiles (listDir read-only; je Datei readFull-Editor on-demand).
//   - Einzeldatei-Eintrag (z.B. settings.json): direkt der einspaltige
//     OverviewEditor (readFull-Voll-Inhalt, gated Save).
// Heuristik: letztes Pfad-Segment mit Datei-Endung → Einzeldatei, sonst Ordner.
//
// Der Drawer-Detail-Weg bleibt erhalten: Klick auf „Details" ruft onOpen (KEIN
// Rückbau). Die Übersichts-Datei liegt einseitig (Claude-/lokale Kopie):
// claudePath = entry.path, kein sharedPath → Seitenwahl blendet sich aus.

const STATUS_PILL: Record<ConfigEntry['status'], { text: string; cls: string }> = {
  active: { text: 'aktiv', cls: 'same' },
  stale: { text: 'veraltet', cls: 'abw' },
  conflict: { text: 'Konflikte', cls: 'abw' },
  dup: { text: 'Duplikate', cls: 'abw' },
  archived: { text: 'archiviert', cls: 'abw' },
  acknowledged: { text: 'bestätigt', cls: 'same' }
}

// Letztes Pfad-Segment als Datei-Anzeige-/Umbenennen-Basisname.
function baseName(p: string): string {
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || p
}

// Eltern-Ordner eines Pfades (ohne fs/path im Renderer; Trenner-treu).
function dirName(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const cut = norm.lastIndexOf('/')
  if (cut <= 0) return norm
  const parent = norm.slice(0, cut)
  // Original-Trenner beibehalten (Windows-Backslash falls vorhanden).
  return p.includes('\\') ? parent.replace(/\//g, '\\') : parent
}

// Definitions-Manifest eines Item-Ordners (Skill/Agent). Der Scanner setzt
// entry.path bei Skill-/Agent-Ordnern auf die DEFINITIONSDATEI (SKILL.md/AGENT.md,
// shared-scan W1-Fix), nicht auf den Ordner selbst. Solche Eintraege sind in der
// Uebersicht ORDNER (Innendatei-Liste), nicht Einzeldateien. README/index sind
// bewusst NICHT hier (kommen auch freistehend vor) — Gleichlauf mit dedupe.ts.
const MANIFEST_RX = /(^|[/\\])(SKILL|AGENT)\.md$/i

// Heuristik Einzeldatei vs. Ordner: ein letztes Segment mit Datei-Endung
// (z.B. "settings.json", "AGENTS.md") ist eine Einzeldatei → direkter Editor.
// Ohne Endung (z.B. "agent-routing") ist es ein Ordner → Innendatei-Liste.
// AUSNAHME: Ein Manifest-Pfad (SKILL.md/AGENT.md) ist ein ORDNER-Eintrag — sein
// Ordner (dirname) traegt die Innendateien. Dot-Verzeichnisse (".claude") zaehlen
// NICHT als Endung (kein Basisname davor).
function isSingleFile(p: string): boolean {
  if (MANIFEST_RX.test(p.replace(/\\/g, '/'))) return false
  return /[^/\\.][^/\\]*\.[^/\\.]+$/.test(p.replace(/\\/g, '/'))
}

// Ordnerpfad eines Uebersichts-Eintrags fuer die Innendatei-Liste: bei Manifest-
// Eintraegen der enthaltende Ordner, sonst der Pfad selbst.
function dirPathOf(p: string): string {
  return MANIFEST_RX.test(p.replace(/\\/g, '/')) ? dirName(p) : p
}

export function OverviewEntry({
  cat,
  entry,
  onOpen
}: {
  cat: Category
  entry: ConfigEntry
  onOpen(id: string): void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={'dup-entry' + (open ? ' open' : '')}>
      <div className="dup-entry-head-row">
        <button
          type="button"
          className="dup-entry-head"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={'chev-btn' + (open ? ' open' : '')}>{Icon.chev}</span>
          <span className="deh-icon">{Icon[cat.icon]}</span>
          <span className="deh-main">
            <span className="deh-name">
              <span className="deh-fname mono">{entry.name}</span>
              <OverviewStatusBadge status={entry.status} />
            </span>
            <span className="deh-desc">{entry.desc}</span>
            {entry.status === 'conflict' && entry.conflictReason && (
              <span className="deh-conflict">
                <span className="dc-ic">{Icon.warn}</span>
                {entry.conflictReason}
              </span>
            )}
            <LoadInfoLine path={entry.path} origin={entry.origin} fields={entry.fields} loadMode={entry.loadMode} />
          </span>
          <span className="deh-meta">
            <span className="row-path">{entry.updated}</span>
            {/* Detail-Drawer bleibt als zweiter Weg (kein Rückbau). */}
            <span
              className="ove-detail-link"
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onOpen(entry.id) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onOpen(entry.id) } }}
            >
              Details
            </span>
          </span>
        </button>
        <OverviewEntryActions entry={entry} />
      </div>
      {open && (
        <div className="dup-entry-body">
          {isSingleFile(entry.path) ? (
            <OverviewEditor path={entry.path} name={baseName(entry.path)} onDone={() => setOpen(false)} />
          ) : (
            <OverviewFiles dirPath={dirPathOf(entry.path)} />
          )}
        </div>
      )}
    </div>
  )
}

function OverviewStatusBadge({ status }: { status: ConfigEntry['status'] }) {
  const p = STATUS_PILL[status]
  return (
    <span className={'pill ' + p.cls}>
      <span className="pd" />
      {p.text}
    </span>
  )
}

// Zeilenaktionen (Stift/Verschieben/Mehr) wie in der Dup-Ansicht. Einseitig:
// claudePath = entry.path (kein sharedPath). Stift tauscht den Kopf gegen
// RenameInline (über DupRowRename); Write-OFF → disabled + Reason in DupRowActions.
function OverviewEntryActions({ entry }: { entry: ConfigEntry }) {
  const { config, ui } = useStore()
  const knownPaths = useMemo(() => buildKnownPaths(config.data, ui.llm, ''), [config.data, ui.llm])
  const [renaming, setRenaming] = useState(false)
  // Inventar-Eintrag (WP-07): mehrere Plugin-Eintraege teilen sich eine Datei
  // (installed_plugins.json). Umbenennen/Verschieben/Mehr wuerden alle Eintraege
  // betreffen — darum hier kein eigenes Ziel, nur ein verstaendlicher Hinweis.
  if (entry.inventory) {
    return (
      <span className="dfh-actions ove-inventory-note">
        Mehrere Plugin-Einträge teilen eine Datei (installed_plugins.json) —
        kein eigenes Umbenennen- oder Verschieben-Ziel.
      </span>
    )
  }
  // Manifest-Eintrag (SKILL.md/AGENT.md) ist ein ORDNER: Stift/Verschieben wirken
  // auf den enthaltenden Ordner, nicht die Definitionsdatei. Echte Einzeldateien
  // (settings.json, Rule-*.md) behalten Datei-Pfad + kind=Datei.
  const isFolder = !isSingleFile(entry.path)
  const targetPath = isFolder ? dirPathOf(entry.path) : entry.path
  const kind: 'Datei' | 'Ordner' = isFolder ? 'Ordner' : 'Datei'
  const name = baseName(targetPath)
  if (renaming) {
    return (
      <span className="dfh-actions">
        <DupRowRename currentName={name} claudePath={targetPath} kind={kind} onDone={() => setRenaming(false)} />
      </span>
    )
  }
  return (
    <DupRowActions
      name={name}
      kind={kind}
      claudePath={targetPath}
      knownPaths={knownPaths}
      onStartRename={() => setRenaming(true)}
    />
  )
}
