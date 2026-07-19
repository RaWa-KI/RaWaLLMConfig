import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { ConfigEntry } from '@shared/contract'
import { msg } from '../../lib/messages'
import type { DisplayMode } from '../../state/types'
import type { CoverageEntryRow } from './overview-selectors'
import './CoverageRegister.css'

// Coverage-Register (Teilplan E, Owner-Entscheid D1-D3 vom 2026-07-18): eigene
// Overview-Zone „Abdeckung & Register", die nur im Experten-Modus gerendert
// wird. Aus DiagnosisCards.tsx extrahiert — Filter, Expand, Paginierung und
// Datenquelle (selectCoverageEntries) bleiben unveraendert.
// E-WP3 L1: Zeilen tragen den Ack-Schluessel; „So lassen" bestaetigt einen
// Befund dauerhaft (write-gated im Main, disabled ohne Schreibmodus).

interface CoverageRegisterProps {
  rows: CoverageEntryRow[]
  displayMode: DisplayMode
  onAck(row: CoverageEntryRow): void
  ackDisabled: boolean
  ackDisabledReason: string
}

export type CoverageFilter = 'check' | 'decentral' | 'all'
const PAGE_SIZE = 8

export function CoverageRegister({ rows, displayMode, onAck, ackDisabled, ackDisabledReason }: CoverageRegisterProps) {
  const [filter, setFilter] = useState<CoverageFilter>('check')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const filteredRows = useMemo(() => filterCoverageRows(rows, filter), [rows, filter])
  const visibleRows = filteredRows.slice(0, visibleCount)
  const hasMore = visibleRows.length < filteredRows.length
  if (rows.length === 0) return null
  return (
    <section className="ov-zone ov-coverage" aria-labelledby="coverage-register-title">
      <div className="ov-coverage-head">
        <h2 id="coverage-register-title">{msg('coverage.panel.title')}</h2>
        <span>{rows.length}</span>
      </div>
      <p>{msg('coverage.panel.intro')}</p>
      <CoverageFilters filter={filter} onFilter={(nextFilter) => { setFilter(nextFilter); setVisibleCount(PAGE_SIZE) }} />
      <div className="ov-coverage-list">
        {visibleRows.map((row) => <CoverageRow
          key={row.key}
          row={row}
          displayMode={displayMode}
          expanded={expanded.has(row.key)}
          onToggle={() => setExpanded((current) => toggleExpanded(current, row.key))}
          onAck={() => onAck(row)}
          ackDisabled={ackDisabled}
          ackDisabledReason={ackDisabledReason}
        />)}
      </div>
      {hasMore && <button type="button" className="btn ghost ov-coverage-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
        {msg('coverage.more')}
      </button>}
    </section>
  )
}

// Simple-Modus-Ersatz (D3): schlichte Bestaetigt-Zeile direkt unter den
// Befunden — ohne Pfade und Filter, nur bei mindestens einem bestaetigten
// Coverage-Eintrag.
export function CoverageAckLine({ count }: { count: number }) {
  if (count <= 0) return null
  return <p className="ov-coverage-ack-line">{msg('coverage.confirmed.simpleLine', { count: String(count) })}</p>
}

function CoverageFilters(props: { filter: CoverageFilter; onFilter(filter: CoverageFilter): void }) {
  return (
    <div className="ov-coverage-filters" role="group" aria-label={msg('coverage.panel.title')}>
      {(['check', 'decentral', 'all'] as const).map((filter) => <button
        type="button"
        className={filter === props.filter ? 'active' : ''}
        key={filter}
        onClick={() => props.onFilter(filter)}
      >{coverageFilterLabel(filter)}</button>)}
    </div>
  )
}

function CoverageRow(props: {
  row: CoverageEntryRow
  displayMode: DisplayMode
  expanded: boolean
  onToggle(): void
  onAck(): void
  ackDisabled: boolean
  ackDisabledReason: string
}) {
  const entry = props.row.entry
  const sub = coverageSub(entry)
  return <article className="ov-coverage-row">
    <button type="button" className="ov-coverage-toggle" aria-expanded={props.expanded} onClick={props.onToggle}>
      <span className={'ov-dot ' + coverageDotTone(entry)} aria-hidden="true" />
      <span className="ov-coverage-main">
        <span className="ov-coverage-name">{entry.name}</span>
        {sub && <span className="ov-coverage-sub">{sub}</span>}
      </span>
      <span className="ov-coverage-badge">{coverageBadge(entry)}</span>
      <span className={props.expanded ? 'ov-coverage-chevron expanded' : 'ov-coverage-chevron'} aria-hidden="true">{Icon.arrow}</span>
    </button>
    {props.expanded && <div className="ov-coverage-details">
      <p>{entry.conflictReason ?? msg('diagnostics.meaning.problemFound')}</p>
      {props.displayMode === 'expert' && <span>{entry.path}</span>}
      {entry.status !== 'acknowledged' && <p className="ov-coverage-ack">
        <button type="button" className="btn ghost" disabled={props.ackDisabled} onClick={props.onAck}>
          {msg('coverage.action.ack')}
        </button>
        {props.ackDisabled && <span className="ov-coverage-ack-hint">{props.ackDisabledReason}</span>}
      </p>}
    </div>}
  </article>
}

// Status-Punkt der Registerzeile (Farbdisziplin): bestaetigt = ok (--sage),
// Konflikt = offen (--amber), sonst neutral (--warm-gray).
function coverageDotTone(entry: ConfigEntry): 'ok' | 'open' | 'idle' {
  if (entry.status === 'acknowledged') return 'ok'
  if (entry.status === 'conflict') return 'open'
  return 'idle'
}

// Kurzzeile unter dem Titel: Konfliktgrund bevorzugt, sonst Beschreibung;
// beides kann leer sein — dann entfaellt die Zeile (kein Platzhalter).
function coverageSub(entry: ConfigEntry): string {
  return entry.conflictReason ?? entry.desc
}

export function filterCoverageRows(rows: CoverageEntryRow[], filter: CoverageFilter): CoverageEntryRow[] {
  if (filter === 'all') return rows
  if (filter === 'check') return rows.filter((row) => row.entry.status === 'acknowledged')
  return rows.filter((row) => row.entry.status !== 'acknowledged')
}

function coverageFilterLabel(filter: CoverageFilter): string {
  if (filter === 'check') return msg('coverage.filter.confirmed')
  if (filter === 'decentral') return msg('coverage.filter.onDemand')
  return msg('coverage.filter.all')
}

function coverageBadge(entry: ConfigEntry): string {
  return entry.status === 'acknowledged' ? msg('coverage.badge.confirmed') : msg('coverage.badge.onDemand')
}

function toggleExpanded(current: Set<string>, id: string): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}
