// WP-C1/C2/C3: Pfad-Baum. „Ein Ort" zeigt jede Config-Einheit an ihrer Ebene
// (Managed→User→Projekt→Lokal→Geteilt) mit 4 ehrlich abgeleiteten Markern; im
// Vergleichsmodus stehen je Blatt 4 Spalten (Userglobal/Shared/WS/Archiv) mit
// ehrlichen Zellzustaenden. Filter „Nur Auffaelligkeiten" gilt in beiden Modi.
// Drag-to-Move (nur „Ein Ort"): Blatt ziehen → MoveDialog (wiederverwendet aus
// ../config/MoveDialog, gated/backup-first über useWriteConfig.moveEntryVersioned).
import { useMemo, useState } from 'react'
import type { Category, ConfigEntry, Scope } from '@shared/contract'
import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { Icon } from '../../components/Icon'
import { ScopeCard } from './ScopeCard'
import { MoveDialog } from '../config/MoveDialog'
import { buildKnownPaths } from '../config/known-paths'
import { SCOPES, byScope, cascadeNames, sameLevelDup, isFlagged, type MarkerCtx } from './tree-logic'
import './TreeSection.css'

// Vier feste Vergleichs-Spalten (sichtbare deutsche Koepfe — Owner-Vorgabe).
export interface CompareCol {
  id: 'userglobal' | 'shared' | 'ws' | 'archiv'
  label: string
}
export const COMPARE_COLS: ReadonlyArray<CompareCol> = [
  { id: 'userglobal', label: 'Userglobal' },
  { id: 'shared', label: 'Shared' },
  { id: 'ws', label: 'WS' },
  { id: 'archiv', label: 'Archiv' }
]

// Ein Drag-Subjekt: das gezogene Blatt + seine Herkunft (fuer den MoveDialog).
export interface DragLeaf {
  cat: Category
  e: ConfigEntry
}

export function TreeSection() {
  const { config, ui } = useStore()
  const { moveEntryVersioned, busy, lastError } = useWriteConfig()
  const ad = config.data?.data[ui.llm]
  const cats = ad?.categories ?? []
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [compare, setCompare] = useState(false)
  const [moveOf, setMoveOf] = useState<DragLeaf | null>(null)
  const [drag, setDrag] = useState<DragLeaf | null>(null)
  const [hover, setHover] = useState<Scope | null>(null)

  const ctx: MarkerCtx = useMemo(
    () => ({ cascade: cascadeNames(cats), sameLevelDup: sameLevelDup(cats) }),
    [cats]
  )
  const grouped = useMemo(() => byScope(cats), [cats])
  const knownPaths = useMemo(() => buildKnownPaths(config.data, ui.llm, ''), [config.data, ui.llm])

  if (config.loading) {
    return (
      <main className="main treewrap">
        <div className="empty">
          {Icon.refresh}
          <p>Baum wird geladen …</p>
        </div>
      </main>
    )
  }
  if (!ad) {
    return (
      <main className="main treewrap">
        <div className="empty">
          {Icon.plug}
          <p>Keine Config-Daten für dieses LLM.</p>
        </div>
      </main>
    )
  }

  const total = SCOPES.reduce((n, s) => n + grouped[s.id].length, 0)
  // Move-Subjekt: das Blatt liegt auf genau EINER Ebene; sein Pfad ist die zu
  // dieser Ebene passende Seite (shared → sharedPath, sonst claudePath).
  const moveSide: Scope | undefined = moveOf?.e.scope

  async function onMove(req: MoveVersionedRequest): Promise<void> {
    const ok = await moveEntryVersioned(req)
    if (ok) setMoveOf(null)
  }

  return (
    <main className="main treewrap">
      <div className="view-head tree-head">
        <div className="tree-toolbar">
          <div className="seg-toggle">
            <button
              type="button"
              className={'seg' + (!compare ? ' on' : '')}
              onClick={() => setCompare(false)}
            >
              Ein Ort
            </button>
            <button
              type="button"
              className={'seg' + (compare ? ' on' : '')}
              onClick={() => setCompare(true)}
            >
              Vergleich
            </button>
          </div>
          <button
            type="button"
            className={'pill ' + (onlyFlagged ? 'active' : 'ghost')}
            onClick={() => setOnlyFlagged((v) => !v)}
          >
            {onlyFlagged ? 'Alle zeigen' : 'Nur Auffälligkeiten'}
          </button>
        </div>
      </div>

      <TreeLegend />

      {compare && (
        <div className="mach-head">
          <span className="mh-axis">
            {Icon.arrow}
            <span>Ebenen senkrecht · Speicherorte waagerecht</span>
          </span>
          <span className="mh-spacer" />
          {COMPARE_COLS.map((c) => (
            <span className="mh-col" key={c.id}>
              <b>{c.label}</b>
            </span>
          ))}
        </div>
      )}

      <div className="tree">
        {SCOPES.map((s) => {
          const all = grouped[s.id]
          const items = onlyFlagged ? all.filter((it) => isFlagged(it.cat, it.e, ctx)) : all
          return (
            <ScopeCard
              key={s.id}
              scope={s}
              items={items}
              total={all.length}
              ctx={ctx}
              onlyFlagged={onlyFlagged}
              compare={compare}
              drag={drag}
              hover={hover}
              onDragLeaf={(leaf) => setDrag(leaf)}
              onDragEnd={() => {
                setDrag(null)
                setHover(null)
              }}
              onHover={(sc) => setHover(sc)}
              onDropScope={(sc) => {
                if (drag && drag.e.scope !== sc) setMoveOf(drag)
                setDrag(null)
                setHover(null)
              }}
            />
          )
        })}
      </div>

      <div className="tree-foot">
        {Icon.snap}
        <span>
          {total} Einheiten auf {SCOPES.filter((s) => grouped[s.id].length).length} Ebenen.{' '}
          <b>Gleiche Einheit auf mehreren Ebenen ist gewollt</b> (Kaskade) — nur <b>Kopie</b> und{' '}
          <b>Fehl-Dublette</b> gehören bereinigt.
        </span>
      </div>

      {moveOf && (
        <MoveDialog
          open
          name={moveOf.e.name}
          kind="Datei"
          sharedPath={moveSide === 'shared' ? moveOf.e.path : undefined}
          claudePath={moveSide !== 'shared' ? moveOf.e.path : undefined}
          knownPaths={knownPaths}
          busy={busy}
          errorText={lastError}
          onMove={onMove}
          onClose={() => setMoveOf(null)}
        />
      )}
    </main>
  )
}

// Legende der vier Faelle (ausgelagert, haelt TreeSection unter HR27-Funktionslimit).
function TreeLegend() {
  return (
    <div className="tree-legend card flat">
      <span className="tl-item">
        <span className="tl-chip casc">N Ebenen</span> bewusste Kaskade — <b>keine</b> Dublette
      </span>
      <span className="tl-item">
        <span className="tl-chip copy">Kopie</span> echte Kopie — abgleichen
      </span>
      <span className="tl-item">
        <span className="tl-chip ptr">Verweis →</span> zeigt auf eine andere Ebene
      </span>
      <span className="tl-item">
        <span className="tl-chip warn">Fehl-Dublette</span> versehentlich doppelt auf einer Ebene
      </span>
    </div>
  )
}
