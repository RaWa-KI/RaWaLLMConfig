import type { ChunkRow } from './merge-chunks'
import { CHUNK, seiteForFamily } from '@shared/dup-labels'
import { useStore } from '../../state/store'

// Pfeil-Tooltips aus @shared/dup-labels (CHUNK(seite).linksTip/rechtsTip) — seite-
// abhaengig (Welle 1): Codex-Paare nennen „Codex", Claude-Paare „Claude".
// Keine verbotenen Begriffe (Quelle → Ziel → Wirkung).

// Chunk-Uebernahme-Pfeile des editierbaren Paar-Diffs (v4-Mockup §Pfeile,
// eigene Mittelspalte). Pro Diff-Chunk eine kleine schwebende Pfeil-Karte mit
// zwei vertikal gestapelten Buttons: ← (oben) kopiert von Seite nach Shared,
// → (unten) kopiert von Shared nach Seite. Die Karte sitzt mittig im 44px-
// Mittelkanal zwischen den Editoren (CSS column-gap auf .cm-mergeViewEditors)
// und ist vertikal an der Chunk-Startposition ausgerichtet (top aus ChunkRow) —
// im Zwischenraum, NICHT auf dem Content. Verschwindet ein Chunk nach Uebernahme,
// verschwindet auch seine Pfeil-Karte (rows kommt frisch aus der View). Reine
// Anzeige + Klick-Callback; keine Logik, kein fs/IPC.

export function MergeArrows({
  rows,
  disabled,
  onAdopt
}: {
  rows: ChunkRow[]
  disabled: boolean
  onAdopt(index: number, dir: 'left' | 'right'): void
}) {
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const chunk = CHUNK(seite)

  if (rows.length === 0) return <div className="merge-arrows merge-arrows-empty" aria-hidden="true" />
  return (
    <div className="merge-arrows">
      {rows.map((r) => (
        <div className="merge-chunk-row" style={{ top: Math.round(Math.min(r.topA, r.topB)) }} key={r.index}>
          <span className="merge-chunk-card">
          <button
            type="button"
            className="merge-arrow-btn"
            disabled={disabled}
            title={chunk.linksTip}
            onClick={() => onAdopt(r.index, 'left')}
          >
            ←
          </button>
          <button
            type="button"
            className="merge-arrow-btn"
            disabled={disabled}
            title={chunk.rechtsTip}
            onClick={() => onAdopt(r.index, 'right')}
          >
            →
          </button>
          </span>
        </div>
      ))}
    </div>
  )
}
