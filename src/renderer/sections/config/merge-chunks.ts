import type { EditorView } from 'codemirror'
import { getChunks } from '@codemirror/merge'
import type { Chunk } from '@codemirror/merge'

// Chunk-Uebernahme-Helfer fuer den editierbaren Paar-Diff (HR27-Split aus
// MergeEditor.tsx). Reine Logik ueber CodeMirror-MergeView-Editoren, KEIN React,
// KEIN fs/IPC. Quelle: v4-Mockup §Pfeile (←/→) — ein Absatz wird von einer Seite
// auf die andere kopiert; danach verschwindet der Pfeil, weil der Chunk weg ist.
// 'a' = linke Seite (Shared — zentrale Version), 'b' = rechte Seite (Claude — deine Kopie).

// Eine Pfeil-Zeile im UI: gehoert zu genau einem Diff-Chunk und kennt dessen
// vertikale Position (oberste Zeile auf der jeweiligen Seite) fuer die Ausrichtung.
export interface ChunkRow {
  index: number
  // Dokument-Offsets des Chunks auf beiden Seiten (vollstaendiger readFull-Stand).
  fromA: number
  toA: number
  fromB: number
  toB: number
  // Vertikale Pixel-Position (oben) relativ zum Editor-Scroll, fuer dynamische Ausrichtung.
  topA: number
  topB: number
}

// Aktuelle Chunk-Zeilen aus der MergeView ableiten. side 'a' liefert die Chunks
// aus Sicht von Editor a (beide Editoren teilen dasselbe Chunk-Set). Position je
// Seite ueber coordsAtPos -> top; null wenn (noch) nicht messbar.
export function buildChunkRows(a: EditorView, b: EditorView): ChunkRow[] {
  const info = getChunks(a.state)
  if (!info) return []
  return info.chunks.map((c: Chunk, index) => ({
    index,
    fromA: c.fromA,
    toA: c.toA,
    fromB: c.fromB,
    toB: c.toB,
    topA: topOf(a, c.fromA),
    topB: topOf(b, c.fromB)
  }))
}

// Vertikale Position der Chunk-Startzeile RELATIV zur Overlay-Offset-Parent
// (.merge-host-wrap ~ Editor-Scroller-Oberkante). Screen-Y der Zeile
// (view.documentTop + block.top) minus Screen-Y des Scrollers, damit die
// Pfeil-Karte exakt am Chunk sitzt — KEIN doppelter Wrap-Offset (sonst landet
// die Karte um die Wrap-Oberkante zu tief) und scroll-sicher.
function topOf(view: EditorView, pos: number): number {
  const block = view.lineBlockAt(Math.min(pos, view.state.doc.length))
  const scrollerTop = view.scrollDOM.getBoundingClientRect().top
  return view.documentTop + block.top - scrollerTop
}

// Inhalt eines Chunks von Quelle nach Ziel kopieren. dir 'right' = a -> b
// (Shared nach Claude), dir 'left' = b -> a (Claude nach Shared). Ersetzt den
// Ziel-Bereich vollstaendig durch den Quell-Text; Save passiert separat per Seite.
export function adoptChunk(a: EditorView, b: EditorView, row: ChunkRow, dir: 'left' | 'right'): void {
  if (dir === 'right') {
    const text = a.state.doc.sliceString(row.fromA, row.toA)
    b.dispatch({ changes: { from: row.fromB, to: row.toB, insert: text } })
  } else {
    const text = b.state.doc.sliceString(row.fromB, row.toB)
    a.dispatch({ changes: { from: row.fromA, to: row.toA, insert: text } })
  }
}
