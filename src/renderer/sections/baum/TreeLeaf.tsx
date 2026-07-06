// Ein Baum-Blatt (WP-C1/C2/C3): Eintragsname + Pfad + abgeleitete Marker-Badges.
// „Ein Ort": draggable (Drag-to-Move, das Ziel waehlt der MoveDialog). Vergleich:
// 4 Zellen (Userglobal/Shared/WS/Archiv) mit EHRLICHEN Zustaenden — Praesenz aus
// scope/Kaskade, „Kopie" aus dupOf, Archiv aus origin; nichts erfunden („—").
import type { Category, ConfigEntry, Scope } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { markersFor, type MarkerCtx } from './tree-logic'
import { COMPARE_COLS, type CompareCol, type DragLeaf } from './TreeSection'

interface TreeLeafProps {
  cat: Category
  e: ConfigEntry
  ctx: MarkerCtx
  compare: boolean
  dragging: boolean
  onDragLeaf(leaf: DragLeaf): void
  onDragEnd(): void
}

// Welche Vergleichs-Spalte traegt eine Ebene? (managed+global → Userglobal,
// shared → Shared, project+local → WS). Archiv-Spalte hat keine eigene Ebene.
function colOf(scope: Scope): CompareCol['id'] {
  if (scope === 'shared') return 'shared'
  if (scope === 'project' || scope === 'local') return 'ws'
  return 'userglobal' // managed | global
}

// Auf welchen Vergleichs-Spalten ist diese Einheit BELEGBAR vorhanden? (aus der
// Kaskade — gleiche cat+name ueber Ebenen). Archiv bleibt aussen vor (kein Ebenen-
// Scope); es wird separat aus origin abgeleitet.
function presentCols(cat: Category, e: ConfigEntry, ctx: MarkerCtx): Set<CompareCol['id']> {
  const out = new Set<CompareCol['id']>()
  const scopes = ctx.cascade.get(cat.id + '::' + e.name)
  if (scopes) scopes.forEach((s) => out.add(colOf(s)))
  else out.add(colOf(e.scope))
  return out
}

// Ehrlicher Archiv-Hinweis: nur wenn origin sprechend auf Backup/Archiv zeigt.
function hasArchivHint(e: ConfigEntry): boolean {
  const o = e.origin?.toLowerCase() ?? ''
  return o.includes('archiv') || o.includes('backup') || o.includes('sicherung')
}

export function TreeLeaf({ cat, e, ctx, compare, dragging, onDragLeaf, onDragEnd }: TreeLeafProps) {
  const m = markersFor(cat, e, ctx)
  return (
    <div
      className={'tleaf' + (compare ? ' compare' : '') + (dragging ? ' dragging' : '')}
      draggable={!compare}
      onDragStart={
        compare
          ? undefined
          : (ev) => {
              onDragLeaf({ cat, e })
              ev.dataTransfer.effectAllowed = 'move'
            }
      }
      onDragEnd={compare ? undefined : onDragEnd}
    >
      <span className="tleaf-grip">{Icon[cat.icon] ?? Icon.list}</span>
      <span className="tleaf-name mono">{e.name}</span>
      <span className="tleaf-markers">
        {m.cascade > 1 && <span className="tl-chip casc">{m.cascade} Ebenen</span>}
        {m.ref && <span className="tl-chip ptr">Verweis →</span>}
        {m.copy && <span className="tl-chip copy">Kopie</span>}
        {m.fehlDup && <span className="tl-chip warn">Fehl-Dublette</span>}
        {e.status === 'stale' && <span className="tl-chip stale">veraltet</span>}
        {e.status === 'conflict' && <span className="tl-chip warn">Konflikt</span>}
      </span>
      {compare ? (
        <CompareCells cat={cat} e={e} ctx={ctx} copy={m.copy} />
      ) : (
        <span className="tleaf-path">{e.path}</span>
      )}
    </div>
  )
}

// Die vier Vergleichs-Zellen eines Blatts (ehrlich aus den Daten).
function CompareCells({
  cat,
  e,
  ctx,
  copy
}: {
  cat: Category
  e: ConfigEntry
  ctx: MarkerCtx
  copy: boolean
}) {
  const present = presentCols(cat, e, ctx)
  const home = e.scope === 'shared' ? 'shared' : e.scope === 'project' || e.scope === 'local' ? 'ws' : 'userglobal'
  const archiv = hasArchivHint(e)
  return (
    <div className="mach-cells">
      {COMPARE_COLS.map((c) => {
        if (c.id === 'archiv') {
          return (
            <div className={'mcell' + (archiv ? '' : ' empty')} key={c.id}>
              {archiv ? <span className="mc-chip bak">Backup</span> : '—'}
            </div>
          )
        }
        if (!present.has(c.id)) {
          return (
            <div className="mcell empty" key={c.id}>
              —
            </div>
          )
        }
        // „Kopie" nur in der Heimat-Spalte des kopierten Blatts kennzeichnen.
        const isCopy = copy && c.id === home
        return (
          <div className="mcell" key={c.id}>
            <span className={'mc-chip ' + (isCopy ? 'same' : 'canon')}>
              {isCopy ? 'Kopie' : 'vorhanden'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
