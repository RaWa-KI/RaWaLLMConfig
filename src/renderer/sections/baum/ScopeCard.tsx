// Eine Ebene des Pfad-Baums (WP-C1/C2/C3): Titel + Zaehler + Liste der Blaetter.
// „Ein Ort" wie WP-C1; im Vergleichsmodus rendert jedes Blatt 4 Spalten. Als
// Drop-Ziel (nur „Ein Ort"): ein hierher gezogenes Blatt von einer ANDEREN Ebene
// oeffnet den MoveDialog (Reuse) — der Move selbst laeuft gated über useWriteConfig.
import { Icon } from '../../components/Icon'
import { TreeLeaf } from './TreeLeaf'
import type { Leaf, MarkerCtx, ScopeDef } from './tree-logic'
import type { DragLeaf } from './TreeSection'

interface ScopeCardProps {
  scope: ScopeDef
  items: Leaf[] // bereits gefiltert (Filter „Nur Auffaelligkeiten")
  total: number // Gesamtzahl auf dieser Ebene (ungefiltert) fuer den Zaehler
  ctx: MarkerCtx
  onlyFlagged: boolean
  compare: boolean
  drag: DragLeaf | null
  hover: ScopeDef['id'] | null
  onDragLeaf(leaf: DragLeaf): void
  onDragEnd(): void
  onHover(scope: ScopeDef['id'] | null): void
  onDropScope(scope: ScopeDef['id']): void
}

export function ScopeCard(props: ScopeCardProps) {
  const { scope, items, total, ctx, onlyFlagged, compare } = props
  const { drag, hover, onDragLeaf, onDragEnd, onHover, onDropScope } = props
  // Drop nur im „Ein Ort"-Modus und nur fuer ein Blatt von einer ANDEREN Ebene.
  const isDrop = !compare && !!drag && drag.e.scope !== scope.id
  const hot = isDrop && hover === scope.id

  // Pro Kategorie buendeln, Reihenfolge stabil ueber das erste Vorkommen.
  const byCat = new Map<string, { icon: string; folder: string; list: Leaf[] }>()
  items.forEach((it) => {
    const g = byCat.get(it.cat.id) ?? { icon: it.cat.icon, folder: it.cat.label, list: [] }
    g.list.push(it)
    byCat.set(it.cat.id, g)
  })

  return (
    <section
      className={'scope-card' + (hot ? ' hot' : '') + (isDrop ? ' droppable' : '')}
      onDragOver={(e) => {
        if (isDrop) {
          e.preventDefault()
          if (hover !== scope.id) onHover(scope.id)
        }
      }}
      onDragLeave={() => {
        if (hover === scope.id) onHover(null)
      }}
      onDrop={(e) => {
        if (isDrop) {
          e.preventDefault()
          onDropScope(scope.id)
        }
      }}
    >
      <header className="scope-head">
        <span className="scope-ic">{Icon[scope.icon] ?? Icon.box}</span>
        <div className="scope-meta">
          <div className="scope-title">{scope.label}</div>
        </div>
        <span className="scope-count">{total}</span>
      </header>

      {hot && (
        <div className="drop-hint">
          {Icon.arrow}
          <span>hierher verschieben — Ziel im Dialog wählbar</span>
        </div>
      )}

      {byCat.size === 0 ? (
        <div className="scope-empty">
          {isDrop ? 'hierher ziehen, um zu verschieben' : onlyFlagged ? 'nichts Auffälliges' : '— leer'}
        </div>
      ) : (
        [...byCat.values()].map((g) => (
          <div className="tcat" key={g.folder}>
            <div className="tcat-head">
              <span className="tcat-ic">{Icon[g.icon] ?? Icon.list}</span>
              <span className="tcat-name">{g.folder}</span>
              <span className="tcat-n">{g.list.length}</span>
            </div>
            <div className="tleaves">
              {g.list.map((it) => (
                <TreeLeaf
                  key={it.e.id}
                  cat={it.cat}
                  e={it.e}
                  ctx={ctx}
                  compare={compare}
                  dragging={drag?.e.id === it.e.id}
                  onDragLeaf={onDragLeaf}
                  onDragEnd={onDragEnd}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  )
}
