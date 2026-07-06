import { useState } from 'react'
import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import { Icon } from '../../components/Icon'
import { useWriteConfig } from '../../state/store-write-config'
import { MoveDialog } from './MoveDialog'
import { RenameInline } from './RenameInline'
import {
  SICHERUNG,
  labelOrdnerAktion,
  ordnerConfirm,
  type OrdnerAktionLabel
} from '@shared/dup-labels'

// HR27-Split aus DirOrphanActions.tsx: die selbsterklaerenden Ordner-Aktionen
// fuer einen nur-einseitig vorhandenen Eintrag (v4 §Mehr…-Block, „Ganzen Ordner …
// mit allen N Dateien"). Alle Texte stammen aus shared/dup-labels.ts
// (labelOrdnerAktion / ordnerConfirm) — Quelle→Ziel→Wirkung selbsterklaerend,
// keine Trunk/Mirror/Merge-Begriffe sichtbar. Schreibt NIE selbst: nutzt die
// BESTEHENDEN gated Routen renameEntry / moveEntryVersioned / archiveDirEntry
// (backup-first, Confirm-Pflicht). Bei OFF sind die Knoepfe disabled + Tooltip.

// Folder-Kontext eines orphan-Eintrags (vom Drilldown durchgereicht; optional,
// damit die Datei-Zeilenaktionen auch ohne Folder-Wiring funktionieren).
export interface OrphanFolderCtx {
  // Physische Seite des orphan-Ordners ('shared' = zentral, 'claude' = lokal).
  side: 'shared' | 'claude'
  // ECHTER Ordnerpfad der vorhandenen Seite (nie DuplicateSet.name).
  folderPath: string
  // Ordner-/Skill-Name (Anzeige + Pfadbau), z.B. „agent-routing".
  folderName: string
  // Anzahl Dateien im Ordner (selbsterklaerende „mit N Dateien"-Texte).
  fileCount: number
  // Bekannte Zielpfade fuer den Verschieben-PathPicker (nie Secret-Werte).
  knownPaths: string[]
}

// Aktive Folder-Aktion: Umbenennen-Inline, Verschieben-Dialog oder Archiv-Confirm.
type FolderMode = 'rename' | 'move' | 'archive' | null

// „Mehr …"-Block: drei selbsterklaerende Ganzer-Ordner-Aktionen (v4 §dup-actions-more).
export function OrphanFolderActions({ ctx }: { ctx: OrphanFolderCtx }) {
  const { writeEnabled, writeReason } = useWriteConfig()
  const [mode, setMode] = useState<FolderMode>(null)
  const disabledTitle = !writeEnabled ? (writeReason ?? 'Schreibmodus nicht aktiv') : undefined

  if (mode === 'rename') return <OrphanFolderRename ctx={ctx} onDone={() => setMode(null)} />
  if (mode === 'move') return <OrphanFolderMove ctx={ctx} onDone={() => setMode(null)} />
  if (mode === 'archive') return <OrphanFolderArchive ctx={ctx} onDone={() => setMode(null)} />

  return (
    <div className="orf-more">
      <FolderActBtn
        art="umbenennen"
        ctx={ctx}
        disabled={!writeEnabled}
        title={disabledTitle}
        onClick={() => setMode('rename')}
      />
      <FolderActBtn
        art="verschieben"
        ctx={ctx}
        disabled={!writeEnabled}
        title={disabledTitle}
        onClick={() => setMode('move')}
      />
      <FolderActBtn
        art="archivieren"
        ctx={ctx}
        archive
        disabled={!writeEnabled}
        title={disabledTitle}
        onClick={() => setMode('archive')}
      />
    </div>
  )
}

// Gestapelter Ordner-Aktions-Button (Haupttext + selbsterklaerende Unterzeile).
function FolderActBtn({
  art,
  ctx,
  archive,
  disabled,
  title,
  onClick
}: {
  art: 'umbenennen' | 'verschieben' | 'archivieren'
  ctx: OrphanFolderCtx
  archive?: boolean
  disabled: boolean
  title: string | undefined
  onClick(): void
}) {
  const lbl: OrdnerAktionLabel = labelOrdnerAktion(art, ctx.folderName, ctx.fileCount)
  const ic = art === 'umbenennen' ? Icon.edit : art === 'verschieben' ? Icon.arrow : Icon.archive
  return (
    <button
      type="button"
      className={'orf-btn' + (archive ? ' archive' : '')}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="orf-main">{ic}{lbl.titel}</span>
      <span className="orf-sub">{lbl.sub}</span>
    </button>
  )
}

// Ganzen Ordner umbenennen: RenameInline auf die vorhandene Seite (Seitenwahl
// entfaellt — nur diese eine physische Seite existiert).
function OrphanFolderRename({ ctx, onDone }: { ctx: OrphanFolderCtx; onDone(): void }) {
  const { renameEntry } = useWriteConfig()
  const sharedPath = ctx.side === 'shared' ? ctx.folderPath : undefined
  const claudePath = ctx.side === 'claude' ? ctx.folderPath : undefined
  return (
    <RenameInline
      currentName={ctx.folderName}
      sharedPath={sharedPath}
      claudePath={claudePath}
      kind="Ordner"
      defaultSide={ctx.side}
      onRename={(req) => renameEntry(req)}
      onCancel={onDone}
    />
  )
}

// Ganzen Ordner verschieben: MoveDialog auf die vorhandene Seite (freier Pfad
// + Schnellwahl; Scope-Pruefung bleibt MAIN-seitig, Fehler bleibt sichtbar).
function OrphanFolderMove({ ctx, onDone }: { ctx: OrphanFolderCtx; onDone(): void }) {
  const { moveEntryVersioned, busy, lastError } = useWriteConfig()
  const sharedPath = ctx.side === 'shared' ? ctx.folderPath : undefined
  const claudePath = ctx.side === 'claude' ? ctx.folderPath : undefined
  async function onMove(req: MoveVersionedRequest) {
    const ok = await moveEntryVersioned(req)
    if (ok) onDone()
  }
  return (
    <MoveDialog
      open
      name={ctx.folderName}
      kind="Ordner"
      fileCount={ctx.fileCount}
      sharedPath={sharedPath}
      claudePath={claudePath}
      knownPaths={ctx.knownPaths}
      busy={busy}
      errorText={lastError}
      onMove={onMove}
      onClose={onDone}
    />
  )
}

// Ganzen Ordner archivieren: Confirm + bestehende gated archiveDirEntry-Route.
function OrphanFolderArchive({ ctx, onDone }: { ctx: OrphanFolderCtx; onDone(): void }) {
  const { archiveDirEntry, busy, writeEnabled, writeReason } = useWriteConfig()
  const txt = ordnerConfirm('archivieren', ctx.side, ctx.folderName)
  const disabledTitle = !writeEnabled ? (writeReason ?? 'Schreibmodus nicht aktiv') : undefined
  async function confirm() {
    const ok = await archiveDirEntry(ctx.folderPath)
    if (ok) onDone()
  }
  return (
    <div className="dir-drill-confirm">
      <div className="dup-confirm-title">{Icon.warn}{txt.titel}</div>
      <p className="dup-confirm-text">{txt.text}</p>
      <div className="dup-confirm-paths mono">
        <div>Ordner: {ctx.folderPath}</div>
      </div>
      <div className="dup-confirm-hint">{Icon.snap}{SICHERUNG.snapshot}</div>
      <div className="dup-confirm-btns">
        <button type="button" className="dup-btn" onClick={onDone} disabled={busy}>
          {Icon.x}Abbrechen
        </button>
        <button
          type="button"
          className="dup-btn keep"
          onClick={confirm}
          disabled={busy || !writeEnabled}
          title={disabledTitle}
        >
          {Icon.archive}{busy ? 'Arbeitet …' : 'Bestätigen'}
        </button>
      </div>
    </div>
  )
}
