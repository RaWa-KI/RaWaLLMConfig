import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { MergeView } from '@codemirror/merge'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { useWriteConfig } from '../../state/store-write-config'
import { useStore } from '../../state/store'
import { useRafRefresh } from '../../lib/useRafRefresh'
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

function sameChunkRows(a: ChunkRow[], b: ChunkRow[]): boolean {
  if (a.length !== b.length) return false
  return a.every((row, i) => {
    const other = b[i]
    return row.index === other.index && row.fromA === other.fromA && row.toA === other.toA
      && row.fromB === other.fromB && row.toB === other.toB && row.topA === other.topA
      && row.topB === other.topB
  })
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
  const { rows, dirty, refresh, resetRows } = useMergeRefresh(viewRef, initialTrunk, initialMirror)
  const [busy, setBusy] = useState<SaveSide | null>(null)
  useMountedMergeView(hostRef, viewRef, props, writeEnabled, refresh, resetRows)
  useWindowRefresh(refresh)
  const { onAdopt, save, revert } = useMergeCommands({
    viewRef, rows, writeEnabled, busy, setBusy, editEntry, props, refresh
  })

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

function useMergeRefresh(viewRef: RefObject<MergeView | null>, initialTrunk: string, initialMirror: string) {
  const [rows, setRows] = useState<ChunkRow[]>([])
  const [dirty, setDirty] = useState(false)
  const refreshNow = useCallback(() => {
    const v = viewRef.current
    if (!v) return
    const nextRows = buildChunkRows(v.a, v.b)
    const nextDirty = v.a.state.doc.toString() !== initialTrunk || v.b.state.doc.toString() !== initialMirror
    setRows((cur) => (sameChunkRows(cur, nextRows) ? cur : nextRows))
    setDirty((cur) => (cur === nextDirty ? cur : nextDirty))
  }, [initialTrunk, initialMirror, viewRef])
  const refresh = useRafRefresh(refreshNow)
  const resetRows = useCallback(() => {
    setRows([])
    setDirty(false)
  }, [])
  return { rows, dirty, refresh, resetRows }
}

function useMountedMergeView(
  hostRef: RefObject<HTMLDivElement | null>,
  viewRef: RefObject<MergeView | null>,
  props: MergeEditorProps,
  writeEnabled: boolean,
  refresh: () => void,
  resetRows: () => void,
) {
  const { trunkPath, mirrorPath, initialTrunk, initialMirror } = props
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const view = new MergeView({
      a: sideConfig(initialTrunk, trunkPath, writeEnabled, refresh),
      b: sideConfig(initialMirror, mirrorPath, writeEnabled, refresh),
      parent: el,
      gutter: true,
      highlightChanges: true
    })
    viewRef.current = view
    refresh()
    return () => { view.destroy(); viewRef.current = null; resetRows() }
  }, [trunkPath, mirrorPath, initialTrunk, initialMirror, writeEnabled, refresh, resetRows, hostRef, viewRef])
}

function useWindowRefresh(refresh: () => void) {
  useEffect(() => {
    window.addEventListener('scroll', refresh, { passive: true })
    window.addEventListener('resize', refresh)
    return () => {
      window.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
    }
  }, [refresh])
}

interface MergeCommandsArgs {
  viewRef: RefObject<MergeView | null>
  rows: ChunkRow[]
  writeEnabled: boolean
  busy: SaveSide | null
  setBusy(side: SaveSide | null): void
  editEntry(path: string, content: string): Promise<boolean>
  props: MergeEditorProps
  refresh(): void
}

function useMergeCommands(args: MergeCommandsArgs) {
  const { viewRef, rows, writeEnabled, busy, setBusy, editEntry, props, refresh } = args
  const onAdopt = (index: number, dir: 'left' | 'right') => {
    const v = viewRef.current
    if (!v || !writeEnabled) return
    const row = rows.find((r) => r.index === index)
    if (!row) return
    adoptChunk(v.a, v.b, row, dir)
    refresh()
  }
  const save = async (side: SaveSide) => {
    const v = viewRef.current
    if (!v || !writeEnabled || busy) return
    const path = side === 'a' ? props.trunkPath : props.mirrorPath
    const content = (side === 'a' ? v.a : v.b).state.doc.toString()
    setBusy(side)
    try { await editEntry(path, content) } finally { setBusy(null) }
  }
  const revert = () => {
    const v = viewRef.current
    if (!v || !writeEnabled) return
    v.a.dispatch({ changes: { from: 0, to: v.a.state.doc.length, insert: props.initialTrunk } })
    v.b.dispatch({ changes: { from: 0, to: v.b.state.doc.length, insert: props.initialMirror } })
    refresh()
  }
  return { onAdopt, save, revert }
}
