import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../components/Icon'
import { useWriteConfig } from '../../state/store-write-config'
import { MoveDialog } from './MoveDialog'
import { MENU, ZEILE, WRITE_AUS } from '@shared/dup-labels'

// DupRowActions — LIVE-Verdrahtung der v4-Zeilenaktionen (WP-08) fuer eine
// Datei- oder Eintrags-Zeile: Stift (oeffnet inline RenameInline, Trigger liegt
// beim Parent via onStartRename) · Verschieben (oeffnet MoveDialog mit ECHTEN
// Pfaden je Seite + Versions-Wahl) · Mehr … (Mini-Menue mit denselben Aktionen,
// damit auch bei wenig Platz beides erreichbar bleibt — v4 §Mehr). Schreibt NIE
// selbst: Move laeuft ueber moveEntryVersioned (getypte Bridge, backup-first).
// Bei Write-OFF (RAWALLM_WRITE_ENABLED=0) sind alle Buttons disabled mit
// verstaendlichem Reason-Tooltip (WriteModeIndicator-Status).
//
// Sichtbare Texte aus @shared/dup-labels (ZEILE/WRITE_AUS/MENU). Die Mini-Menue-
// Beschriftungen kommen aus dem zentralen Sprach-Anker (MENU.umbenennen/verschieben).

export interface DupRowActionsProps {
  // Name + Art nur fuer Anzeige/Move-Pfadbau.
  name: string
  kind?: 'Datei' | 'Ordner'
  // Anzahl Dateien (nur bei Ordnern; „mit N Dateien" im MoveDialog).
  fileCount?: number
  // ECHTE physische Pfade je Seite (nie der Anzeigename). 'shared' = Shared-/
  // Trunk-Seite, 'claude' = Claude-/Mirror-Seite; fehlende Seite blendet Wahl aus.
  sharedPath?: string
  claudePath?: string
  // Schnellwahl-Ziele fuer den MoveDialog (PathPicker).
  knownPaths: string[]
  // Trigger fuer den Inline-Rename — der Parent tauscht die Zeile gegen RenameInline.
  onStartRename(): void
}

export function DupRowActions(props: DupRowActionsProps) {
  const { name, kind = 'Datei', fileCount, sharedPath, claudePath, knownPaths, onStartRename } = props
  const { writeEnabled, writeReason, busy, moveEntryVersioned } = useWriteConfig()
  const [moveOpen, setMoveOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined
  const startRename = () => { setMenuOpen(false); onStartRename() }
  const startMove = () => { setMenuOpen(false); setMoveError(null); setMoveOpen(true) }
  // MoveDialog reicht je gewaehlter Version EINEN Aufruf rein; sanitisierten
  // Fehler (z.B. out-of-scope) sichtbar lassen, Dialog bei Erfolg schliessen.
  async function onMove(req: Parameters<typeof moveEntryVersioned>[0]) {
    const ok = await moveEntryVersioned(req)
    if (ok) setMoveOpen(false)
    else setMoveError('Verschieben nicht möglich — Ziel prüfen (Sicherung blieb erhalten).')
  }

  return (
    <span className="dfh-actions" onClick={(e) => e.stopPropagation()}>
      <RowActionButtons
        dis={!writeEnabled}
        disabledTitle={disabledTitle}
        menuOpen={menuOpen}
        onMenuToggle={() => setMenuOpen((v) => !v)}
        onRename={startRename}
        onMove={startMove}
      />
      <MoveDialog
        open={moveOpen}
        name={name}
        kind={kind}
        fileCount={fileCount}
        sharedPath={sharedPath}
        claudePath={claudePath}
        knownPaths={knownPaths}
        busy={busy}
        errorText={moveError}
        onMove={onMove}
        onClose={() => setMoveOpen(false)}
      />
    </span>
  )
}

// Die drei Icon-Buttons (Stift/Verschieben/Mehr) + Mini-Menue. Reine Anzeige,
// keine eigene Logik — Trigger kommen vom Parent (DupRowActions).
interface RowActionButtonsProps {
  dis: boolean
  disabledTitle?: string
  menuOpen: boolean
  onMenuToggle(): void
  onRename(): void
  onMove(): void
}

function RowActionButtons({ dis, disabledTitle, menuOpen, onMenuToggle, onRename, onMove }: RowActionButtonsProps) {
  return (
    <>
      <button type="button" className="icon-act dfh-rename" onClick={onRename} disabled={dis} title={disabledTitle ?? ZEILE.umbenennenTip} aria-label={ZEILE.umbenennenTip}>
        {Icon.edit}
      </button>
      <button type="button" className="icon-act dfh-move" onClick={onMove} disabled={dis} title={disabledTitle ?? ZEILE.verschiebenTip} aria-label={ZEILE.verschiebenTip}>
        {Icon.arrow}
      </button>
      <RowMoreButton open={menuOpen} onToggle={onMenuToggle} dis={dis} disabledTitle={disabledTitle}>
        <button type="button" className="dfh-menu-item" onClick={onRename}>
          {Icon.edit}
          {MENU.umbenennen}
        </button>
        <button type="button" className="dfh-menu-item" onClick={onMove}>
          {Icon.arrow}
          {MENU.verschieben}
        </button>
      </RowMoreButton>
    </>
  )
}

// „Mehr …"-Button + Mini-Menue. Menue-Inhalt kommt als children (gleiche Aktionen).
// Das Menue wird per Portal an document.body gerendert und fixed an den Button
// verankert (rechtsbuendig), damit es NICHT von overflow:hidden-Vorfahren
// (.dir-file in DirDiffView, .dup-entry in DuplicatePanel) abgeschnitten wird.
function RowMoreButton({
  open,
  onToggle,
  dis,
  disabledTitle,
  children
}: {
  open: boolean
  onToggle(): void
  dis: boolean
  disabledTitle?: string
  children: React.ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const pos = useMenuAnchor(open, btnRef)
  // Ausserhalb-Klick / Scroll / Resize schliessen das Menue (sonst „klebt" das
  // fixe Menue an alter Position). Klicks AUF Button oder Menue (Portal) zaehlen
  // nicht als aussen — sonst wuerde das Menue vor dem Item-onClick unmounten.
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as Node | null
      if (e.type === 'mousedown' && t && (btnRef.current?.contains(t) || menuRef.current?.contains(t))) return
      onToggle()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close, true)
    }
  }, [open, onToggle])

  return (
    <span className="dfh-more-wrap">
      <button ref={btnRef} type="button" className="icon-act dfh-more" onClick={onToggle} disabled={dis} title={disabledTitle ?? ZEILE.mehr} aria-label={ZEILE.mehr} aria-expanded={open}>
        {Icon.list}
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} className="dfh-menu dfh-menu-fixed" style={{ top: pos.top, right: pos.right }}>
          {children}
        </div>,
        document.body
      )}
    </span>
  )
}

// Misst die Button-Position (viewport-relativ) fuer das fixe Menue: top unter dem
// Button, right buendig zur rechten Button-Kante. Laeuft synchron vor dem Paint
// (useLayoutEffect), damit das Menue nicht kurz an (0,0) aufblitzt.
function useMenuAnchor(open: boolean, btnRef: React.RefObject<HTMLButtonElement | null>) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !btnRef.current) {
      setPos(null)
      return
    }
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
  }, [open, btnRef])
  return pos
}
