import type { LoadMode } from '@shared/contract'
import { LoadHintBadge } from '../compare/LoadHintBadge'
import { hintFromLoadMode } from '../compare/load-mode-hint'
import { classifyLoad } from '../compare/load-semantics'
import './LoadInfoLine.css'

// LoadInfoLine — dezente Lade-Hinweis-Zeile unter Name/Beschreibung eines
// Uebersichts-Eintrags. Zeigt WANN das Tool die Datei laedt (laienverstaendliches
// Chip via LoadHintBadge) UND eine kurze, IMMER sichtbare Erklaerung in EIGENER
// Zeile (Owner-Wunsch: nicht nur als Tooltip). Quelle der Erklaerung: hint.control.
// Der Quelle-Tooltip bleibt zusaetzlich erhalten. Reine Anzeige: KEINE Werte, kein
// fs/IPC, NUR span-Elemente (wird in einen <button> eingebettet — keine
// button/a/input-Tags).

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
  const hint = loadMode ? hintFromLoadMode(loadMode) : classifyLoad(path, origin, fields)
  return (
    <span className="load-info-line" title={`Quelle: ${hint.source}`}>
      <span className="lil-head">
        <LoadHintBadge hint={hint} />
      </span>
      <span className="lil-explain">{hint.control}</span>
    </span>
  )
}
