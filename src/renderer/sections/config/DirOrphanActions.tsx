import { useState, type ReactElement } from 'react'
import type { DirFileEntry } from '@shared/contract'
import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import { Icon } from '../../components/Icon'
import { ZEILE, SECRET_PAAR } from '@shared/dup-labels'
import { useWriteConfig } from '../../state/store-write-config'
import { MoveDialog } from './MoveDialog'
import { RenameInline } from './RenameInline'
import { OrphanConfirm } from './DirOrphanConfirm'
import { OrphanFolderActions, type OrphanFolderCtx } from './DirOrphanFolder'
import './DirOrphanActions.css'

// Aktionen fuer eine nur-einseitig vorhandene Ordner-Innendatei (nur Shared /
// nur Claude). v4-Kern: dieselben Zeilenaktionen wie bei Diff-/Same-Dateien —
// Stift (umbenennen), Verschieben, Mehr … — PLUS Uebernehmen/Archivieren. Alle
// Wege laufen ueber BESTEHENDE gated Routen (addEntry/removeEntry/renameEntry/
// moveEntryVersioned, backup-first) mit Confirm — KEIN neuer Write-Pfad, KEINE
// neue Bridge. Bei writeEnabled===false sind die Knoepfe disabled + Tooltip.
// 'Uebernehmen' laedt den ROHEN Inhalt frisch (kein maskierter Anzeige-Text).
// Bei maskiertem (Secret-classed) Inhalt sind ALLE mutierenden Aktionen
// (Uebernehmen/Archivieren/Umbenennen/Verschieben) disabled mit sichtbarem Grund
// (SECRET_PAAR.grundUebersprungen) — kein stiller secret-skip/owner-only-Fehlschlag.
// Sichtbare Texte aus dup-labels.ts.

export type { OrphanFolderCtx }

// Folder-Basispfade des Paars (fuer Uebernehmen eines orphan-rel-Eintrags noetig).
export interface DirBases {
  trunkBase: string
  mirrorBase: string
}

// rel mit POSIX-Trenner an einen Basispfad anfuegen (Trennzeichen aus Basis ableiten).
export function joinRel(base: string, rel: string): string {
  if (!base) return ''
  const sep = base.includes('\\') ? '\\' : '/'
  const cleanBase = base.replace(/[\\/]+$/, '')
  const cleanRel = rel.replace(/[\\/]+/g, sep)
  return `${cleanBase}${sep}${cleanRel}`
}

// Basisname (ohne Verzeichnis) eines rel-Pfads — Startwert fuer Umbenennen.
function baseName(rel: string): string {
  const i = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'))
  return i >= 0 ? rel.slice(i + 1) : rel
}

// Aktiver Zeilen-Modus: Confirm (Adopt/Archive), Inline-Rename, Move-Dialog oder
// der Ordner-„Mehr …"-Block. null = nur die Aktionsknoepfe.
type RowMode = 'adopt' | 'archive' | 'rename' | 'move' | 'more' | null

// Folder-Kontext (vom Drilldown durchgereicht). Optional — ohne Wiring stehen
// nur die Datei-Zeilenaktionen, der „Mehr …"-Ordnerblock entfaellt dann.
export interface OrphanActionsProps {
  f: DirFileEntry
  bases: DirBases
  masked: boolean
  folder?: OrphanFolderCtx
}

export function OrphanActions({ f, bases, masked, folder }: OrphanActionsProps) {
  const { writeEnabled, writeReason } = useWriteConfig()
  const [mode, setMode] = useState<RowMode>(null)
  const trunkSide = f.status === 'trunk-only'
  const side: 'shared' | 'claude' = trunkSide ? 'shared' : 'claude'
  const source = (trunkSide ? f.trunkPath : f.mirrorPath) ?? ''
  // Uebernehmen = die vorhandene Datei an der kanonischen Gegenseite anlegen.
  const target = trunkSide ? joinRel(bases.mirrorBase, f.rel) : joinRel(bases.trunkBase, f.rel)
  const disabledTitle = !writeEnabled ? (writeReason ?? 'Schreibmodus nicht aktiv') : undefined

  if (mode === 'adopt' || mode === 'archive') {
    return (
      <OrphanConfirm
        kind={mode}
        source={source}
        target={target}
        masked={masked}
        onCancel={() => setMode(null)}
        onDone={() => setMode(null)}
      />
    )
  }
  if (mode === 'rename') {
    return <RowRename side={side} source={source} rel={f.rel} onDone={() => setMode(null)} />
  }
  if (mode === 'move' && folder) {
    return <RowMove side={side} source={source} rel={f.rel} folder={folder} onDone={() => setMode(null)} />
  }
  if (mode === 'more' && folder) {
    return <OrphanFolderActions ctx={folder} />
  }

  return (
    <OrphanRowButtons
      masked={masked}
      target={target}
      writeEnabled={writeEnabled}
      disabledTitle={disabledTitle}
      hasFolder={!!folder}
      onMode={setMode}
    />
  )
}

interface RowButtonsProps {
  masked: boolean
  target: string
  writeEnabled: boolean
  disabledTitle: string | undefined
  hasFolder: boolean
  onMode(m: RowMode): void
}

// Aktionsknoepfe einer orphan-Zeile (Uebernehmen/Archivieren + Stift/Verschieben/Mehr).
// Maskierter (secret-classed) Inhalt: ALLE mutierenden Aktionen disabled mit
// sichtbarem Grund — der Main-Guard wuerde sie sonst in 'secret-skip'/owner-only
// laufen lassen (kein stiller Fehlschlag-Pfad). „Mehr …" (Ordnerblock) bleibt
// erreichbar (Ordner-Ebene, nicht diese Secret-Datei).
function OrphanRowButtons(p: RowButtonsProps) {
  const secretOff = p.masked
  const writeOff = !p.writeEnabled || secretOff
  const secretTip = secretOff ? SECRET_PAAR.grundUebersprungen : undefined
  const adoptOff = writeOff || !p.target
  const adoptTip = secretTip ?? p.disabledTitle
  return (
    <>
      <DrillBtn icon={Icon.merge} label="Übernehmen" cls="adopt" off={adoptOff} tip={adoptTip} onClick={() => p.onMode('adopt')} />
      <DrillBtn icon={Icon.archive} label="Archivieren" off={writeOff} tip={secretTip ?? p.disabledTitle} onClick={() => p.onMode('archive')} />
      <DrillBtn icon={Icon.edit} label="Umbenennen" off={writeOff} tip={secretTip ?? ZEILE.umbenennenTip} onClick={() => p.onMode('rename')} />
      <DrillBtn icon={Icon.arrow} label="Verschieben" off={writeOff || !p.hasFolder} tip={secretTip ?? ZEILE.verschiebenTip} onClick={() => p.onMode('move')} />
      {p.hasFolder && (
        <DrillBtn icon={Icon.list} label={ZEILE.mehr} tip={ZEILE.mehr} onClick={() => p.onMode('more')} />
      )}
    </>
  )
}

// Einheitlicher Zeilen-Aktionsbutton (bestehende .dir-drill-btn-Stile).
function DrillBtn({
  icon,
  label,
  cls,
  off,
  tip,
  onClick
}: {
  icon: ReactElement
  label: string
  cls?: string
  off?: boolean
  tip?: string
  onClick(): void
}) {
  return (
    <button type="button" className={'dir-drill-btn' + (cls ? ' ' + cls : '')} onClick={onClick} disabled={off} title={tip}>
      {icon}{label}
    </button>
  )
}

// Datei umbenennen (nur die vorhandene Seite — Seitenwahl entfaellt strukturell).
function RowRename({
  side,
  source,
  rel,
  onDone
}: {
  side: 'shared' | 'claude'
  source: string
  rel: string
  onDone(): void
}) {
  const { renameEntry } = useWriteConfig()
  const sharedPath = side === 'shared' ? source : undefined
  const claudePath = side === 'claude' ? source : undefined
  return (
    <RenameInline
      currentName={baseName(rel)}
      sharedPath={sharedPath}
      claudePath={claudePath}
      kind="Datei"
      defaultSide={side}
      onRename={(req) => renameEntry(req)}
      onCancel={onDone}
    />
  )
}

// Datei verschieben (freier Pfad + Schnellwahl; Scope-Pruefung bleibt MAIN-seitig).
function RowMove({
  side,
  source,
  rel,
  folder,
  onDone
}: {
  side: 'shared' | 'claude'
  source: string
  rel: string
  folder: OrphanFolderCtx
  onDone(): void
}) {
  const { moveEntryVersioned, busy, lastError } = useWriteConfig()
  const sharedPath = side === 'shared' ? source : undefined
  const claudePath = side === 'claude' ? source : undefined
  async function onMove(req: MoveVersionedRequest) {
    const ok = await moveEntryVersioned(req)
    if (ok) onDone()
  }
  return (
    <MoveDialog
      open
      name={baseName(rel)}
      kind="Datei"
      sharedPath={sharedPath}
      claudePath={claudePath}
      knownPaths={folder.knownPaths}
      busy={busy}
      errorText={lastError}
      onMove={onMove}
      onClose={onDone}
    />
  )
}
