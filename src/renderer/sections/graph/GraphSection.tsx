import { useEffect, useState } from 'react'
import type { GraphIngestResult } from '@shared/contract-graph'
import { Icon } from '../../components/Icon'
import { GraphMetrics } from './GraphMetrics'
import { OrphanTriage } from './OrphanTriage'
import { GodNodes } from './GodNodes'
import { IgnoreRecommend } from './IgnoreRecommend'
import { IgnoreScopes } from './IgnoreScopes'
import './GraphSection.css'

// Graph-/Wissen-Sektion (WP-B4 final): laedt den read-only graphify-Ingest
// EINMAL (R5), haelt das Resultat in State, rendert WS-Auswahl (per label),
// Metrikkopf + alle Leaves (OrphanTriage/GodNodes/Kollisionen/Ignore-Empfehlung)
// und den Ignore-Scopes-Editor je aktivem WS. Bei placeholder (kein graphify-
// Lauf) entfallen die datengetriebenen Leaves; die Scopes bleiben (unabhaengig
// von graphify-Daten). Nie absoluter ws-Pfad im UI — nur label/Metriken; der
// absolute Root (active.ws) geht ausschliesslich als IPC-Argument an IgnoreScopes.

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; msg: string }
  | { phase: 'done'; workspaces: GraphIngestResult[] }

export function GraphSection() {
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [wsLabel, setWsLabel] = useState<string | null>(null)

  // EINMAL laden (leeres Dep-Array). Kein Re-Scan bei Re-Render (R5).
  useEffect(() => {
    let alive = true
    void (async () => {
      if (typeof window === 'undefined' || !window.electronAPI?.graphIngest) {
        if (alive) setState({ phase: 'error', msg: 'Bridge nicht verfügbar' })
        return
      }
      try {
        const res = await window.electronAPI.graphIngest()
        if (!alive) return
        if (res.error || !res.data) {
          setState({ phase: 'error', msg: res.error ?? 'Graph-Ingest fehlgeschlagen' })
        } else {
          setState({ phase: 'done', workspaces: res.data.workspaces })
        }
      } catch (err) {
        if (alive) {
          setState({ phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' })
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="main graphwrap">
      <GraphBody state={state} wsLabel={wsLabel} onSelect={setWsLabel} />
    </main>
  )
}

function GraphBody(props: {
  state: LoadState
  wsLabel: string | null
  onSelect: (label: string) => void
}) {
  const { state, wsLabel, onSelect } = props

  if (state.phase === 'loading') {
    return (
      <div className="empty">
        {Icon.refresh}
        <p>Lade graphify-Metriken …</p>
      </div>
    )
  }
  if (state.phase === 'error') {
    return (
      <div className="empty gph-error">
        {Icon.warn}
        <p>Fehler: {state.msg}</p>
      </div>
    )
  }

  const { workspaces } = state
  if (workspaces.length === 0) {
    return (
      <div className="empty">
        {Icon.box}
        <p>Keine Workspaces mit graphify-Daten gefunden.</p>
      </div>
    )
  }

  const active = workspaces.find((w) => w.label === wsLabel) ?? workspaces[0]

  return (
    <div className="graph-shell">
      <WsList workspaces={workspaces} activeLabel={active.label} onSelect={onSelect} />
      <GraphPane key={active.label} active={active} />
    </div>
  )
}

// Pane je aktivem WS: Metrikkopf + datengetriebene Leaves + Ignore-Scopes.
// Bei placeholder fehlen graphify-Daten => Triage/GodNodes/Empfehlung entfallen,
// nur ein Hinweis + der (datenunabhaengige) Scopes-Editor bleiben. `active.ws`
// (absoluter Root) NUR als IPC-Argument an IgnoreScopes, NIE im UI sichtbar.
function GraphPane({ active }: { active: GraphIngestResult }) {
  return (
    <section className="graph-pane">
      <div className="gblock-head">
        {Icon.box}
        <h3>{active.label}</h3>
        <span>{active.placeholder ? 'graphify noch nicht gelaufen' : 'Metrikkopf'}</span>
      </div>
      <GraphMetrics metrics={active.metrics} placeholder={active.placeholder} />
      {active.placeholder ? (
        <div className="gph-empty">
          Noch keine graphify-Daten in diesem Workspace — Orphan-Triage, God Nodes und
          Empfehlungen erscheinen nach dem ersten <code>graphify</code>-Lauf. Die Ignore-Scopes
          unten lassen sich unabhaengig davon pflegen.
        </div>
      ) : (
        <>
          <OrphanTriage nodes={active.nodes} links={active.links} />
          <GodNodes nodes={active.nodes} links={active.links} />
          <IgnoreRecommend nodes={active.nodes} />
        </>
      )}
      <IgnoreScopes wsRoot={active.ws} />
    </section>
  )
}

// WS-Auswahl-Spalte: Anzeige IMMER ueber label, NIE ueber den absoluten ws-Pfad.
function WsList(props: {
  workspaces: GraphIngestResult[]
  activeLabel: string
  onSelect: (label: string) => void
}) {
  const { workspaces, activeLabel, onSelect } = props
  return (
    <aside className="graph-side">
      <div className="side-label">Workspaces</div>
      {workspaces.map((w) => (
        <button
          key={w.label}
          type="button"
          className={'nav-item' + (w.label === activeLabel ? ' on' : '')}
          onClick={() => onSelect(w.label)}
        >
          <span className="ni-ic">{Icon.box}</span>
          <span className="ni-txt">{w.label}</span>
          {w.placeholder ? (
            <span className="ni-count">—</span>
          ) : (
            <span className="ni-count">{w.metrics.orphanPct}%</span>
          )}
        </button>
      ))}
    </aside>
  )
}
