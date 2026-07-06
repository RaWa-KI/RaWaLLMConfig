import type { Category, ConfigEntry, EntryStatus, Scope } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { Pill } from '../../components/Pill'
import { OverviewEntry } from './OverviewEntry'

// Read-only Praesentationsteile der Config-Sektion (1:1 Prototyp-Optik).
// Phase 1: NUR Anzeige — keine CRUD-/Reconcile-/Notiz-Pfade.
const SCOPE_LABEL: Record<Scope, string> = {
  managed: 'Managed',
  global: 'Global',
  project: 'Projekt',
  local: 'Lokal',
  shared: 'Geteilt'
}
const SCOPE_ORDER: Scope[] = ['managed', 'global', 'project', 'local', 'shared']

interface RowProps {
  cat: Category
  entry: ConfigEntry
  showCat?: boolean
  // Aktiver Suchbegriff: hebt Treffer in Name/Desc per <mark> hervor (nur Suche).
  highlight?: string
  // true = Treffer kam NUR aus dem Datei-Inhalt (searchKeys/fields), nicht aus dem
  // sichtbaren Text -> sichtbare „Treffer im Datei-Inhalt"-Markierung.
  inFile?: boolean
  onClick(): void
}

// Hebt das (case-insensitive) erste Vorkommen von q im Text per <mark> hervor.
// Fix fuer Audit-Finding searching-flag-unterdrueckt-hervorhebung: SearchView
// reichte query bisher nicht an die Zeile durch, Treffer blieben unmarkiert.
function markHits(text: string, q: string) {
  const term = q.trim()
  if (!term) return text
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  )
}

export function EntryRow({ cat, entry, showCat, highlight, inFile, onClick }: RowProps) {
  const hl = highlight ?? ''
  return (
    <div className="row" onClick={onClick}>
      <div className="row-ic">{Icon[cat.icon]}</div>
      <div className="row-main">
        <div className="row-name">
          <span className="mono">{markHits(entry.name, hl)}</span>
          {showCat && <span className="row-path">· {cat.label}</span>}
          {inFile && (
            <span className="row-infile" title="Der Suchbegriff steht im Datei-Inhalt (Schlüssel/Felder), nicht im Namen.">
              {Icon.search}Treffer im Datei-Inhalt
            </span>
          )}
        </div>
        <div className="row-desc">{markHits(entry.desc, hl)}</div>
      </div>
      <div className="row-meta">
        <span className="row-path">{entry.updated}</span>
        <Pill status={entry.status} />
        <span className="chev">{Icon.chev}</span>
      </div>
    </div>
  )
}

// Übersicht = Dup-Standard (Owner-Reichweite 15:17: ALLE Übersichten editierbar).
// Je Scope-Gruppe eine Liste klappbarer OverviewEntry-Eintraege (einspaltiger
// Direkt-Editor + gleiche Zeilenaktionen). Der Drawer-Detail-Weg (onOpen) bleibt
// erhalten (Details-Link im Eintrags-Kopf).
export function OverviewView({ cat, onOpen }: { cat: Category; onOpen(id: string): void }) {
  const groups = {} as Record<Scope, ConfigEntry[]>
  cat.entries.forEach((e) => {
    ;(groups[e.scope] = groups[e.scope] ?? []).push(e)
  })
  return (
    <div>
      {SCOPE_ORDER.filter((s) => groups[s]).map((scope) => (
        <ScopeGroup key={scope} scope={scope} cat={cat} list={groups[scope]} onOpen={onOpen} />
      ))}
    </div>
  )
}

function ScopeGroup({
  scope,
  cat,
  list,
  onOpen
}: {
  scope: Scope
  cat: Category
  list: ConfigEntry[]
  onOpen(id: string): void
}) {
  return (
    <div className="group">
      <div className="group-head">
        <h3>{SCOPE_LABEL[scope]}</h3>
        <span className="gcount">
          {list.length} {list.length === 1 ? 'Eintrag' : 'Einträge'}
        </span>
      </div>
      <div className="dup-panel">
        {list.map((e) => (
          <OverviewEntry key={e.id} cat={cat} entry={e} onOpen={(id) => onOpen(id)} />
        ))}
      </div>
    </div>
  )
}

export interface SearchHit {
  // Familie des Treffers (claude/codex/…) — fuer cross-family-Oeffnen noetig.
  llm: string
  cat: Category
  entry: ConfigEntry
  // true = Query traf NUR die Datei-/Feld-Seite (searchKeys/fields), nicht den
  // sichtbaren Text -> Renderer markiert „Treffer im Datei-Inhalt".
  inFile?: boolean
}

const STATUS_LABEL: Record<EntryStatus, string> = {
  active: 'aktiv',
  stale: 'veraltet',
  conflict: 'Konflikte',
  dup: 'Duplikate',
  archived: 'archiviert'
}

// Baut den Treffer-Untertitel: zeigt aktiven Status-Filter und/oder Suchbegriff.
function searchSubtitle(count: number, query: string, statusFilter: EntryStatus | null) {
  const parts: string[] = []
  if (statusFilter) parts.push(`Status ${STATUS_LABEL[statusFilter]}`)
  if (query) parts.push(`„${query}"`)
  const what = parts.length ? ` für ${parts.join(' · ')}` : ''
  return `${count} Treffer${what}`
}

export function SearchView({
  hits,
  query,
  statusFilter,
  onOpen
}: {
  hits: SearchHit[]
  query: string
  statusFilter: EntryStatus | null
  onOpen(llm: string, catId: string, entryId: string): void
}) {
  return (
    <div>
      <div className="view-head">
        <div className="view-title">
          <h2>Suche</h2>
          <p>{searchSubtitle(hits.length, query, statusFilter)}</p>
        </div>
      </div>
      {hits.length === 0 ? (
        <div className="empty">
          {Icon.search}
          <p>Nichts gefunden.</p>
        </div>
      ) : (
        <div className="rows">
          {hits.map(({ llm, cat, entry, inFile }) => (
            <EntryRow
              key={llm + cat.id + entry.id}
              cat={cat}
              entry={entry}
              showCat
              highlight={query}
              inFile={inFile}
              onClick={() => onOpen(llm, cat.id, entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// DiffView wurde nach ./DiffView.tsx extrahiert (WP-06, Split-WP). Re-Export hier,
// damit ConfigSection.tsx (importiert DiffView aus config-parts) NICHT bricht —
// Welle 3 raeumt den Import auf.
export { DiffView } from './DiffView'
