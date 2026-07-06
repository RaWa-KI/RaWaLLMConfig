import { useCallback, useEffect, useRef, useState } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { useWriteConfig } from '../../state/store-write-config'
import { useStore } from '../../state/store'
import { seiteForFamily } from '@shared/dup-labels'
import { MergeBar, type SaveSide } from './MergeBar'
import { MergeArrows } from './MergeArrows'
import { MergeColHead } from './MergeColHead'
import { adoptChunk, buildChunkRows, type ChunkRow } from './merge-chunks'
import { buildMergeTheme } from './merge-theme'
import './MergeEditor.css'

// Editierbarer VS-Code-Side-by-side-Diff (CodeMirror MergeView) fuer Einzeldatei-
// Paare (DiffView) und den 'diff'-Drilldown im Ordner-Vergleich. Links = Shared
// (zentrale Version), rechts = Claude (deine Kopie). Schreibmodus-gated: nur bei
// writeEnabled sind beide Seiten editierbar + Speichern/Pfeile aktiv; sonst read-only.
// Chunk-Uebernahme in BEIDE Richtungen ueber eine eigene Pfeil-Spalte (MergeArrows
// + merge-chunks) — v4-Mockup §Pfeile. Schreiben laeuft AUSSCHLIESSLICH ueber den
// gated Write-Layer (useWriteConfig().editEntry -> backup-first). Kein fs/path hier.
// Save-Quelle ist IMMER der vollstaendige Editor-Inhalt (readFull-Stand des Aufrufers),
// nie maskierter/gekappter Text — secret/masked Paare rendern gar keinen MergeEditor.

interface MergeEditorProps {
  trunkPath: string
  mirrorPath: string
  initialTrunk: string
  initialMirror: string
}

// Sprach-Extension nach Dateiendung (Default: keine).
function langFor(path: string): Extension[] {
  if (path.endsWith('.md')) return [markdown()]
  if (path.endsWith('.json')) return [json()]
  return []
}

// Read-only-Extensions wenn Schreibmodus aus; sonst leer (editierbar).
function roExt(writeEnabled: boolean): Extension[] {
  if (writeEnabled) return []
  return [EditorState.readOnly.of(true), EditorView.editable.of(false)]
}

// Eine Editor-Seite konfigurieren: basicSetup + on-brand-Theme + lineWrapping + Sprache + RO-Gate.
function sideConfig(doc: string, path: string, writeEnabled: boolean, onChange: () => void) {
  return {
    doc,
    extensions: [
      basicSetup,
      buildMergeTheme(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged || u.geometryChanged) onChange()
      }),
      ...langFor(path),
      ...roExt(writeEnabled)
    ]
  }
}

export function MergeEditor(props: MergeEditorProps) {
  const { trunkPath, mirrorPath, initialTrunk, initialMirror } = props
  const { writeEnabled, writeReason, editEntry } = useWriteConfig()
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<MergeView | null>(null)
  const [busy, setBusy] = useState<SaveSide | null>(null)
  const [rows, setRows] = useState<ChunkRow[]>([])
  const [dirty, setDirty] = useState(false)

  // Pfeil-Zeilen + dirty-Flag aus dem aktuellen View-Stand neu ableiten.
  const refresh = useCallback(() => {
    const v = viewRef.current
    if (!v) return
    setRows(buildChunkRows(v.a, v.b))
    setDirty(
      v.a.state.doc.toString() !== initialTrunk || v.b.state.doc.toString() !== initialMirror
    )
  }, [initialTrunk, initialMirror])

  // MergeView mounten. Re-create bei Pfad-/Content-/Gate-Wechsel. StrictMode:
  // Cleanup ruft destroy() -> kein doppelter Editor bei doppeltem Mount (React 19).
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const view = new MergeView({
      a: sideConfig(initialTrunk, trunkPath, writeEnabled, refresh),
      b: sideConfig(initialMirror, mirrorPath, writeEnabled, refresh),
      parent: el,
      gutter: true,
      highlightChanges: true
      // collapseUnchanged bewusst NICHT gesetzt (v4-Mockup §voller Inhalt):
      // CM rendert dann den kompletten Datei-Inhalt unverkuerzt, keine
      // '… N unchanged lines …'-Faltung. Richtet zugleich block.top der
      // Chunks an der echten Zeile aus -> Pfeile sitzen am Chunk (merge-chunks).
    })
    viewRef.current = view
    requestAnimationFrame(refresh)
    return () => {
      view.destroy()
      viewRef.current = null
      setRows([])
      setDirty(false)
    }
  }, [trunkPath, mirrorPath, initialTrunk, initialMirror, writeEnabled, refresh])

  // Seiten-Scroll/-Resize -> Pfeil-Positionen neu messen.
  // CM feuert kein geometryChanged wenn .cm-mergeView overflow:visible die SEITE
  // scrollen laesst statt den internen Scroller. Deshalb window-Listener als Ergaenzung.
  useEffect(() => {
    window.addEventListener('scroll', refresh, { passive: true })
    window.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
    }
  }, [refresh])

  // Einen Chunk in die gewuenschte Richtung uebernehmen (←/→), dann Pfeile neu messen.
  function onAdopt(index: number, dir: 'left' | 'right') {
    const v = viewRef.current
    if (!v || !writeEnabled) return
    const row = rows.find((r) => r.index === index)
    if (!row) return
    adoptChunk(v.a, v.b, row, dir)
    requestAnimationFrame(refresh)
  }

  // Aktuellen Editor-Inhalt EINER Seite gated speichern (editEntry zeigt Toast).
  // Save-Quelle ist der vollstaendige Editor-Doc-Stand, nie maskierter Text.
  async function save(side: SaveSide) {
    const v = viewRef.current
    if (!v || !writeEnabled || busy) return
    const path = side === 'a' ? trunkPath : mirrorPath
    const content = (side === 'a' ? v.a : v.b).state.doc.toString()
    setBusy(side)
    try {
      await editEntry(path, content)
    } finally {
      setBusy(null)
    }
  }

  // Beide Seiten auf den geladenen Ausgangsstand zuruecksetzen (kein Schreibvorgang).
  function revert() {
    const v = viewRef.current
    if (!v || !writeEnabled) return
    v.a.dispatch({ changes: { from: 0, to: v.a.state.doc.length, insert: initialTrunk } })
    v.b.dispatch({ changes: { from: 0, to: v.b.state.doc.length, insert: initialMirror } })
    requestAnimationFrame(refresh)
  }

  return (
    <div className="merge-editor">
      <MergeColHead trunkPath={trunkPath} mirrorPath={mirrorPath} seite={seite} />
      <div className="merge-host-wrap">
        <div ref={hostRef} className="merge-host" />
        <MergeArrows rows={rows} disabled={!writeEnabled} onAdopt={onAdopt} />
      </div>
      <MergeBar
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        busy={busy}
        dirty={dirty}
        onSave={save}
        onRevert={revert}
      />
    </div>
  )
}
