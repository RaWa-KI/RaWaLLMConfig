import type { GraphWsMetrics } from '@shared/contract-graph'

// Praesentationaler Metrikkopf der Graph-Sektion (WP-B1). Rendert nur die
// abgeleiteten Pro-WS-Metriken aus GraphWsMetrics als Kacheln (Prototyp-Optik
// `.gstats`/`.gstat`). Keine Datenladung, kein State, keine Secrets — nur Zahlen.

interface Tile {
  n: string
  l: string
  sub?: string
  hot?: boolean
}

function de(n: number): string {
  return n.toLocaleString('de')
}

// Kacheln strikt aus GraphWsMetrics abgeleitet (Stems/Recommendations aus dem
// Prototyp existieren im Contract nicht und werden bewusst weggelassen).
function buildTiles(m: GraphWsMetrics): Tile[] {
  return [
    { n: de(m.files), l: 'Dateien' },
    { n: de(m.nodeCount), l: 'Knoten' },
    { n: de(m.linkCount), l: 'Kanten' },
    { n: de(m.communities), l: 'Communities' },
    { n: de(m.orphanCount), l: 'Orphans', sub: m.orphanPct + '%', hot: true },
    { n: de(m.unresolved), l: 'unresolved Links', hot: true }
  ]
}

export function GraphMetrics({
  metrics,
  placeholder
}: {
  metrics: GraphWsMetrics
  placeholder?: boolean
}) {
  if (placeholder) {
    return (
      <div className="gph-empty">
        graphify in diesem Workspace noch nicht gelaufen — <code>graphify</code>{' '}
        laufen lassen, dann erscheinen hier die Knoten-/Kanten-Metriken.
      </div>
    )
  }

  const tiles = buildTiles(metrics)
  return (
    <div className="gstats">
      {tiles.map((t, i) => (
        <div className={'gstat' + (t.hot ? ' hot' : '')} key={i}>
          <div className="gs-n">
            {t.n}
            {t.sub && <span className="gs-sub">{t.sub}</span>}
          </div>
          <div className="gs-l">{t.l}</div>
        </div>
      ))}
    </div>
  )
}
