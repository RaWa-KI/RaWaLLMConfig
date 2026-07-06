import { useMemo, useState } from 'react'
import type { GraphNode } from '@shared/contract-graph'
import { Icon } from '../../components/Icon'
import { appendGraphignoreRulesForNodes } from './graphIgnoreActions'
import { GraphActionFeedback, GraphConfirm, type GraphActionState } from './GraphIgnoreActionUi'

// Ignore-Empfehlungs-Leaf (WP-B3): praesentational, props-getrieben. Schlaegt
// rekursive Vendor-/Cluster-Ignore-Muster vor und zeigt je Muster den Impact
// (Anzahl Knoten, die das Muster schlucken wuerde). WARNUNG, wenn ein Muster
// Knoten mit `VALIDATED_` im id/Pfad treffen wuerde — das waeren keine Vendor-
// Knoten. Schreiben laeuft nur ueber graphWriteIgnore (backup-first im Main).

interface IgnorePattern {
  glob: string
  reason: string
  // Erkennt, ob eine Knoten-id unter dieses Muster fiele (vereinfachte Glob-
  // Semantik: das Segment muss als Pfad-Teil vorkommen).
  segment: string
}

interface Recommendation {
  glob: string
  reason: string
  impact: number
  validatedHits: number
}

// Standard-Vendor-/Cluster-Muster (rekursive Globs). Reihenfolge = Anzeige.
const PATTERNS: IgnorePattern[] = [
  { glob: '**/node_modules/', reason: 'Vendor-Abhängigkeiten (npm)', segment: 'node_modules' },
  { glob: '**/dist/', reason: 'Build-Ausgabe', segment: 'dist' },
  { glob: '**/build/', reason: 'Build-Ausgabe', segment: 'build' },
  { glob: '**/.git/', reason: 'VCS-Interna', segment: '.git' },
  { glob: '**/vendor/', reason: 'Vendor-Abhängigkeiten (Composer)', segment: 'vendor' },
  { glob: '**/.next/', reason: 'Framework-Cache', segment: '.next' }
]

const VALIDATED_RX = /VALIDATED_/

// Zerlegt eine id in Pfad-Segmente (vorwaerts + rueckwaerts Slashes).
function segmentsOf(id: string): string[] {
  return id.split(/[\\/]/).filter(Boolean)
}

// Zaehlt je Muster Impact + VALIDATED-Treffer (rein, keine Mutation).
function buildRecommendations(nodes: GraphNode[]): Recommendation[] {
  return PATTERNS.map((p) => {
    let impact = 0
    let validatedHits = 0
    for (const n of nodes) {
      if (!segmentsOf(n.id).includes(p.segment)) continue
      impact++
      if (VALIDATED_RX.test(n.id)) validatedHits++
    }
    return { glob: p.glob, reason: p.reason, impact, validatedHits }
  }).filter((r) => r.impact > 0)
}

function RecRow({ rec, nodes }: { rec: Recommendation; nodes: GraphNode[] }) {
  const [state, setState] = useState<GraphActionState>({ phase: 'idle' })

  async function applyRule() {
    setState({ phase: 'saving' })
    try {
      const res = await appendGraphignoreRulesForNodes(nodes, [rec.glob])
      setState(res.ok ? { phase: 'done', result: res } : { phase: 'error', msg: res.error })
    } catch (err) {
      setState({ phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  return (
    <div className="rec-stack">
      <RecLine rec={rec} saving={state.phase === 'saving'} onApply={() => setState({ phase: 'confirm' })} />
      {state.phase === 'confirm' && (
        <GraphConfirm
          title={`${rec.glob} in .graphignore übernehmen?`}
          text="Der bestehende Scope wird gelesen, diese Regel angehängt und backup-first gespeichert."
          onCancel={() => setState({ phase: 'idle' })}
          onConfirm={() => void applyRule()}
        />
      )}
      <GraphActionFeedback
        state={state}
        okText={`Regel gespeichert${state.phase === 'done' && state.result.snapshot ? ' · Backup angelegt' : ''}`}
      />
    </div>
  )
}

function RecLine(props: { rec: Recommendation; saving: boolean; onApply(): void }) {
  const { rec, saving, onApply } = props
  const warn = rec.validatedHits > 0
  return (
    <div className="rec-row">
      <span className={'rf-badge ' + (warn ? 'rem' : 'new')}>
        {warn ? 'Warnung' : 'Vendor'}
      </span>
      <code className="rec-rule">{rec.glob}</code>
      <span className="rec-reason">
        {rec.reason}
        {warn && <span className="rec-warn"> — schluckt {rec.validatedHits.toLocaleString('de')} VALIDATED-Knoten!</span>}
      </span>
      <span className="rec-impact">{rec.impact.toLocaleString('de')} Knoten</span>
      <button type="button" className="ign-save" disabled={saving} onClick={onApply}>
        {Icon.save}
        Anwenden
      </button>
    </div>
  )
}

export function IgnoreRecommend({ nodes }: { nodes: GraphNode[] }) {
  const recs = useMemo(() => buildRecommendations(nodes), [nodes])

  return (
    <div className="gblock">
      <div className="gblock-head">
        {Icon.warn}
        <h3>Ignore-Empfehlungen</h3>
        <span>Vorschlag · .graphignore</span>
      </div>
      <div className="rec-list">
        {recs.length === 0 ? (
          <div className="gph-empty">Keine Vendor-/Cluster-Muster im Graph erkannt.</div>
        ) : (
          recs.map((r) => <RecRow key={r.glob} rec={r} nodes={nodes} />)
        )}
      </div>
      <div className="gnote">
        {Icon.snap}
        <span>
          Anwendung schreibt nur den graphify-Scope über die bestehende Bridge mit Confirm.
        </span>
      </div>
    </div>
  )
}
