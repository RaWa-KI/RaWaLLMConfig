import { useMemo } from 'react'
import type { GraphNode, GraphLink } from '@shared/contract-graph'
import { Icon } from '../../components/Icon'

// God-Nodes-Leaf (WP-B2): praesentational, props-getrieben. Berechnet je Knoten
// den Grad (Anzahl inzidenter Kanten) und zeigt die Top-N als horizontale Balken
// via CSS width:% (keine Graph-Lib). Zusaetzlich Kollisions-Stems: gleicher
// Datei-Stamm (basename ohne Endung) bei mehreren Knoten = mehrdeutiger Wikilink.
// Beides ist rein aus nodes/links ableitbar; nichts erfunden. Nur Metadaten.

const TOP_N = 8
const MAX_COLL = 8

interface DegreeEntry {
  id: string
  degree: number
}

interface CollisionEntry {
  stem: string
  count: number
}

// Zaehlt je Knoten-id, wie oft sie als source/target vorkommt (= Grad).
function buildDegrees(nodes: GraphNode[], links: GraphLink[]): DegreeEntry[] {
  const deg = new Map<string, number>()
  for (const n of nodes) deg.set(n.id, 0)
  for (const l of links) {
    deg.set(l.source, (deg.get(l.source) ?? 0) + 1)
    deg.set(l.target, (deg.get(l.target) ?? 0) + 1)
  }
  return [...deg.entries()]
    .map(([id, degree]) => ({ id, degree }))
    .filter((e) => e.degree > 0)
    .sort((a, b) => b.degree - a.degree)
    .slice(0, TOP_N)
}

// Datei-Stamm: letztes Pfad-Segment ohne Endung, kleingeschrieben.
function stemOf(id: string): string {
  const base = id.split(/[\\/]/).pop() ?? id
  return base.replace(/\.[^.]+$/, '').toLowerCase()
}

// Findet Stems, die bei mehr als einem Knoten vorkommen (mehrdeutige Wikilinks).
function buildCollisions(nodes: GraphNode[]): CollisionEntry[] {
  const byStem = new Map<string, number>()
  for (const n of nodes) {
    const s = stemOf(n.id)
    if (!s) continue
    byStem.set(s, (byStem.get(s) ?? 0) + 1)
  }
  return [...byStem.entries()]
    .filter(([, count]) => count > 1)
    .map(([stem, count]) => ({ stem, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLL)
}

function GodRow({ entry, max }: { entry: DegreeEntry; max: number }) {
  const pct = max > 0 ? (entry.degree / max) * 100 : 0
  return (
    <div className="god-row">
      <span className="god-name mono">{entry.id}</span>
      <span className="god-bar">
        <span className="god-fill" style={{ width: pct + '%' }} />
      </span>
      <span className="god-n">{entry.degree}</span>
    </div>
  )
}

export function GodNodes({ nodes, links }: { nodes: GraphNode[]; links: GraphLink[] }) {
  const degrees = useMemo(() => buildDegrees(nodes, links), [nodes, links])
  const collisions = useMemo(() => buildCollisions(nodes), [nodes])
  const max = degrees.length ? degrees[0].degree : 0

  return (
    <div className="gcols">
      <div className="gblock">
        <div className="gblock-head">
          {Icon.sparkle}
          <h3>God Nodes</h3>
          <span>die stärksten Hubs</span>
        </div>
        <div className="god-list">
          {degrees.length === 0 ? (
            <div className="gph-empty">Keine verbundenen Knoten — Grad nicht ableitbar.</div>
          ) : (
            degrees.map((e) => <GodRow key={e.id} entry={e} max={max} />)
          )}
        </div>
      </div>
      <div className="gblock">
        <div className="gblock-head">
          {Icon.warn}
          <h3>Kollisions-Stems</h3>
          <span>mehrdeutige Wikilinks</span>
        </div>
        <div className="coll-list">
          {collisions.length === 0 ? (
            <div className="gph-empty">Keine mehrdeutigen Datei-Stämme gefunden.</div>
          ) : (
            collisions.map((c) => (
              <div className="coll-row" key={c.stem}>
                <code className="coll-stem">[[{c.stem}]]</code>
                <span className="coll-n">{c.count}×</span>
                <span className="coll-fix">→ Alias + Pfad</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
