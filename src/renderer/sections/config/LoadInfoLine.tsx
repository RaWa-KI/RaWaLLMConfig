import type { LoadMode } from '@shared/contract'
import { LoadHintBadge } from '../compare/LoadHintBadge'
import { resolveLoadHint } from '../compare/load-semantics'
import './LoadInfoLine.css'

// LoadInfoLine — dezente Lade-Hinweis-Zeile unter Name/Beschreibung eines
// Uebersichts-Eintrags. Zeigt WANN das Tool die Datei laedt (laienverstaendliches
// Chip via LoadHintBadge) UND eine kurze, IMMER sichtbare Erklaerung in EIGENER
// Zeile (Owner-Wunsch: nicht nur als Tooltip). Quelle der Erklaerung: hint.control.
// Der Quelle-Tooltip bleibt zusaetzlich erhalten. Reine Anzeige: KEINE Werte, kein
// fs/IPC, NUR span-Elemente (wird in einen <button> eingebettet — keine
// button/a/input-Tags).
//
// Prioritaet (WP-9/B12): NICHT mehr "loadMode schlaegt classifyLoad" — das liess
// die origin-/frontmatter-bewusste Semantik tot im else-Zweig liegen, weil der
// Scanner loadMode immer setzt (scan-entry.ts). resolveLoadHint entscheidet:
// classifyLoad gewinnt, wo sie doc-belegt UND feiner ist als der grobe Scanner-
// loadMode (z.B. Workspace-CLAUDE.md: Scanner 'immer', Semantik 'beim Arbeiten
// hier'); sonst gilt der Scanner-Wert.

export function LoadInfoLine({
  path,
  origin,
  fields,
  loadMode,
}: {
  path: string
  origin?: string
  fields?: Record<string, string>
  loadMode?: LoadMode
}) {
  const hint = resolveLoadHint(path, origin, fields, loadMode)
  return (
    <span className="load-info-line" title={`Quelle: ${hint.source}`}>
      <span className="lil-head">
        <LoadHintBadge hint={hint} />
      </span>
      <span className="lil-explain">{hint.control}</span>
    </span>
  )
}
