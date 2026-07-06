import { useEffect, useRef, useState } from 'react'
import type { RenameRequest, RenameSide } from '@shared/contract-write-rename'
import { Icon } from '../../components/Icon'
import { SICHERUNG, UMBENENNEN, WRITE_AUS, seiteForFamily } from '@shared/dup-labels'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import './RenameInline.css'

// RenameInline — wiederverwendbarer Inline-Umbenennen-Editor (v4 §Umbenennen,
// Mockup-JS startRename/rnSide/applyRename). Stift-Trigger oeffnet diese Zeile;
// Eingabe + Seitenwahl-Chips (beide / nur Shared / nur <Seite>) + Wirkungszeile +
// Enter/Abbrechen. Schreibt NIE selbst: ruft `onRename` mit ECHTEN Pfaden je Seite
// (RenameSidePath aus den Props) — niemals DuplicateSet.name. Generisch gehalten
// (Erweiterungs-Auflage 1: spaeterer Baum nutzt dieselbe Komponente): Pfade+Name
// rein, Callback raus, kein Dup-Panel-Spezifikum eingebacken.
//
// Seitenwahl-Chips und Wirkungstexte sind seiten-abhaengig: Seite wird LOKAL aus
// useStore().ui.llm + seiteForFamily() abgeleitet — kein neues seite-Prop.
// Sichtbare Texte aus @shared/dup-labels (UMBENENNEN(seite)): Seiten-Wirkungstext,
// Chip-Beschriftungen und Bestaetigen/Abbrechen-Tooltips kommen aus dem zentralen
// Sprach-Anker (Quelle → Ziel → Wirkung).

// Seiten-abhaengige Label-Maps aus UMBENENNEN(seite) ableiten (Welle 1 WP-04).
// Der 'claude'-Key in RenameSide bezeichnet physisch die Mirror-Seite — Beschriftung
// zeigt die echte Familie (z.B. „nur Codex" bei Codex-Paaren).
function buildRnLabels(seite: ReturnType<typeof seiteForFamily>) {
  const u = UMBENENNEN(seite)
  return {
    sideText: { beide: u.wirkBeide, shared: u.wirkShared, claude: u.wirkClaude } as Record<RenameSide, string>,
    chipText: { beide: u.chipBeide, shared: u.chipShared, claude: u.chipClaude } as Record<RenameSide, string>,
    ok: u.okTip,
    cancel: u.cancelTip
  }
}

export interface RenameInlineProps {
  // Aktueller Basisname (Datei oder Ordner), als Startwert + Selektions-Basis.
  currentName: string
  // ECHTER physischer Pfad je Seite (nie der DuplicateSet.name). Ist eine Seite
  // nicht vorhanden, wird ihr Chip ausgeblendet/deaktiviert.
  sharedPath?: string
  claudePath?: string
  // 'Datei' | 'Ordner' nur fuer den Wirkungstext.
  kind?: 'Datei' | 'Ordner'
  // Default-Seitenwahl (Owner: 'beide').
  defaultSide?: RenameSide
  onRename(req: RenameRequest): void | Promise<unknown>
  onCancel(): void
}

// Erlaubte Seitenwahl je nach vorhandenen Pfaden ableiten.
function allowedSides(sharedPath?: string, claudePath?: string): RenameSide[] {
  const out: RenameSide[] = []
  if (sharedPath && claudePath) out.push('beide')
  if (sharedPath) out.push('shared')
  if (claudePath) out.push('claude')
  return out.length ? out : ['beide']
}

// Selektion auf Basisnamen ohne Endung setzen (Komfort wie im Mockup).
function selectBase(inp: HTMLInputElement, name: string): void {
  const dot = name.lastIndexOf('.')
  const slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'))
  inp.setSelectionRange(slash >= 0 ? slash + 1 : 0, dot > 0 ? dot : name.length)
}

export function RenameInline({
  currentName,
  sharedPath,
  claudePath,
  kind = 'Datei',
  defaultSide = 'beide',
  onRename,
  onCancel
}: RenameInlineProps) {
  const { ui } = useStore()
  const { writeEnabled, writeReason } = useWriteConfig()
  const seite = seiteForFamily(ui.llm)
  const rn = buildRnLabels(seite)
  const sides = allowedSides(sharedPath, claudePath)
  const initialSide = sides.includes(defaultSide) ? defaultSide : sides[0]
  const [value, setValue] = useState(currentName)
  const [side, setSide] = useState<RenameSide>(initialSide)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const inp = inputRef.current
    if (inp) {
      inp.focus()
      selectBase(inp, currentName)
    }
  }, [currentName])

  function buildSidePaths(s: RenameSide): Pick<RenameRequest, 'shared' | 'claude'> {
    const out: Pick<RenameRequest, 'shared' | 'claude'> = {}
    if ((s === 'beide' || s === 'shared') && sharedPath) out.shared = { side: 'shared', path: sharedPath }
    if ((s === 'beide' || s === 'claude') && claudePath) out.claude = { side: 'claude', path: claudePath }
    return out
  }

  function apply() {
    if (!writeEnabled) return
    const neu = value.trim() || currentName
    // Reiner Basisname (kein Pfad-Segment) — Schutz vor versehentlichem Verschieben.
    if (neu.includes('/') || neu.includes('\\')) return
    onRename({ sides: side, newName: neu, ...buildSidePaths(side) })
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation()
    if (e.key === 'Enter') apply()
    else if (e.key === 'Escape') onCancel()
  }

  const okTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : rn.ok

  return (
    <span className="ri-wrap renaming" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="ri-input mono"
        value={value}
        spellCheck={false}
        aria-label="Neuer Name"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
      />
      <span className="ri-chips">
        {sides.map((s) => (
          <button
            key={s}
            type="button"
            className={'ri-chip' + (s === side ? ' active' : '')}
            onClick={() => setSide(s)}
          >
            {rn.chipText[s]}
          </button>
        ))}
      </span>
      <button
        type="button"
        className="ri-act ok"
        onClick={apply}
        disabled={!writeEnabled}
        title={okTitle}
        aria-label={okTitle}
      >
        {Icon.check}
      </button>
      <button type="button" className="ri-act" onClick={onCancel} title={rn.cancel} aria-label={rn.cancel}>
        {Icon.x}
      </button>
      <span className="ri-effect">
        {kind} umbenennen — {rn.sideText[side]} · {SICHERUNG.vorher}
      </span>
    </span>
  )
}
