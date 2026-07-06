import type { Category, ConfigEntry, DuplicateSet, EntryStatus, LlmConfig } from '@shared/contract'
import type { CoverageRow } from '@shared/contract-coverage'
import { normalizeCat } from '@shared/cat-key'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { OverviewView, SearchView, type SearchHit } from './config-parts'
import { DuplicatePanel } from './DuplicatePanel'
import { ConfigWriteConfirm } from './ConfigWriteConfirm'
import { CompareView } from '../compare/CompareView'
import { CoverageView } from '../coverage/CoverageView'
import { ConfigDiagnostics } from './ConfigDiagnostics'
import { DiagnosticsSummary } from './DiagnosticsSummary'

// Config-Sektion: Kategorie-Sidebar + Anzeige (Uebersicht / Duplikate) oder
// Suchtreffer. WP-D-a: EntryDetailPanel als Overlay entfernt (dual-drawer-overlay-
// occludes-editpanel); Detail laeuft nur noch ueber den Drawer-Tab 'detail'.
// EntryDetailPanel-Import entfernt — Komponente bleibt im Codebase (HR7).
export function ConfigSection() {
  const { config, ui, actions } = useStore()
  const ad = config.data?.data[ui.llm]
  if (!ad) {
    return (
      <div className="empty">
        {Icon.plug}
        <p>{config.error ?? 'Keine Config-Daten für dieses LLM.'}</p>
      </div>
    )
  }
  // searching-Flag = aktive Textsuche ODER aktiver Status-Filter (beide oeffnen
  // die SearchView). Kategorie-Klick leert search UND statusFilter und wechselt
  // sicher zur CategoryView (overview).
  const searching = !!ui.search.trim() || ui.statusFilter !== null
  return (
    <>
      <CategorySidebar
        ad={ad}
        catId={ui.catId}
        searching={searching}
        onPick={(id) => {
          actions.setSearch('')
          if (ui.statusFilter !== null) actions.toggleStatusFilter(ui.statusFilter)
          actions.setCatId(id)
          actions.setMode('overview')
        }}
      />
      <main className="main">
        {config.error && (
          <div className="card flat" style={{ marginBottom: 12 }}>
            <div className="empty" style={{ padding: 20 }}>{config.error}</div>
          </div>
        )}
        <DiagnosticsSummary ad={ad} />
        <ConfigMain ad={ad} />
      </main>
      {/* Confirm-Consumer für Übersicht-Direkt-Editor (WP-09); nur bei
          geschlossenem Drawer, disjunkt zum DrawerEdit-Consumer. */}
      <ConfigWriteConfirm />
    </>
  )
}

function categoryFlag(cat: Category) {
  if (cat.entries.some((e) => e.status === 'conflict')) return 'var(--terra)'
  if (cat.entries.some((e) => e.status === 'stale')) return 'var(--amber)'
  if (cat.entries.some((e) => e.status === 'dup')) return 'var(--papa)'
  return null
}

function CategorySidebar({
  ad,
  catId,
  searching,
  onPick
}: {
  ad: LlmConfig
  catId: string | null
  searching: boolean
  onPick(id: string): void
}) {
  return (
    <aside className="sidebar">
      <div className="side-label">Kategorien</div>
      {ad.categories.map((c) => {
        const flag = categoryFlag(c)
        return (
          <button
            key={c.id}
            type="button"
            className={'nav-item' + (catId === c.id && !searching ? ' on' : '')}
            onClick={() => onPick(c.id)}
          >
            <span className="ni-ic">{Icon[c.icon]}</span>
            <span className="ni-txt">{c.label}</span>
            {flag && (
              <span
                className="ni-flag"
                ref={(el) => {
                  if (el) el.style.background = flag
                }}
              />
            )}
            <span className="ni-count">{c.entries.length}</span>
          </button>
        )
      })}
      {ad.categories.length === 0 && <div className="empty-state">Noch keine Kategorien.</div>}
    </aside>
  )
}

// Sichtbarer Treffer-Text (name+desc+cat.label) — case-insensitiv durchsucht.
// Liefert die Sichtbar-Seite getrennt, damit „Treffer im Datei-Inhalt" exakt dann
// markiert wird, wenn NUR die Index-/Feld-Seite (nicht der sichtbare Text) matcht.
function visibleText(cat: Category, entry: ConfigEntry): string {
  return (entry.name + ' ' + entry.desc + ' ' + cat.label).toLowerCase()
}

// Datei-Inhalts-Seite: extrahierte searchKeys (NUR Keys/Headings, NIE Werte) plus
// die Feld-Schluessel UND -Werte aus entry.fields. Felder sind kuratierte, bereits
// maskierte Anzeige-Werte (Secret-Werte landen dort nie) — daher mitdurchsuchbar.
function fileText(entry: ConfigEntry): string {
  const keys = entry.searchKeys ?? []
  const fields = entry.fields ?? {}
  const fieldText = Object.entries(fields)
    .map(([k, v]) => k + ' ' + v)
    .join(' ')
  return (keys.join(' ') + ' ' + fieldText).toLowerCase()
}

// Einen Eintrag gegen den (lowercase) Query pruefen und ggf. als Hit anhaengen.
// inFile=true, wenn der sichtbare Text NICHT matcht, aber die Datei-/Feld-Seite —
// dann markiert der Renderer „Treffer im Datei-Inhalt".
function pushHit(
  out: SearchHit[],
  llm: string,
  cat: Category,
  entry: ConfigEntry,
  q: string,
): void {
  const inVisible = visibleText(cat, entry).includes(q)
  const inFile = !inVisible && fileText(entry).includes(q)
  if (inVisible || inFile) out.push({ llm, cat, entry, inFile })
}

// Echter Filter: Textsuche UND Status-Filter kombinierbar. Mit Text-Query wird
// cross-family ueber ALLE config.data.data-Familien gesucht (Owner-Default); ohne
// Query (reiner Status-Filter) bleibt es bei der aktuellen Familie, damit die
// per-Familie-Status-Sicht nicht vermischt wird. Leerer Query matcht alles.
function buildHits(
  families: Record<string, LlmConfig>,
  currentLlm: string,
  query: string,
  statusFilter: EntryStatus | null,
): SearchHit[] {
  const q = query.trim().toLowerCase()
  const out: SearchHit[] = []
  const ids = q ? Object.keys(families) : [currentLlm]
  for (const llm of ids) {
    const ad = families[llm]
    if (!ad) continue
    ad.categories.forEach((cat) =>
      cat.entries.forEach((entry) => {
        if (statusFilter !== null && entry.status !== statusFilter) return
        pushHit(out, llm, cat, entry, q)
      }),
    )
  }
  return out
}

function ConfigMain({ ad }: { ad: LlmConfig }) {
  const { config, ui, actions } = useStore()
  const query = ui.search.trim()
  if (query || ui.statusFilter !== null) {
    const families = config.data?.data ?? {}
    // Treffer oeffnen. Gleiche Familie: Drawer oeffnet direkt (unveraendert).
    // Fremde Familie: erst Familie wechseln, damit der Eintrag dort sichtbar ist.
    // Hinweis: der Store-Effekt (store.tsx) leert bei echtem Familienwechsel
    // Auswahl + Suche, daher oeffnet ein Fremd-Treffer den Drawer NICHT im selben
    // Klick — der Owner landet in der Ziel-Familie und oeffnet dort. Ein
    // gekoppeltes Fremd-Oeffnen braucht eine Store-Anpassung (ausserhalb dieses
    // Write-Sets, als needs-shared-file gemeldet).
    const onOpen = (llm: string, catId: string, entryId: string) => {
      if (llm !== ui.llm) actions.setLlm(llm)
      actions.openEntry(catId, entryId)
    }
    return (
      <SearchView
        hits={buildHits(families, ui.llm, query, ui.statusFilter)}
        query={query}
        statusFilter={ui.statusFilter}
        onOpen={onOpen}
      />
    )
  }
  const cat = ad.categories.find((c) => c.id === ui.catId)
  if (!cat) return <ConfigEmpty ad={ad} />
  return <CategoryView ad={ad} cat={cat} />
}

function ConfigEmpty({ ad }: { ad: LlmConfig }) {
  const cs = ad.comingSoon
  return (
    <div className="empty empty-state">
      {Icon.plug}
      <p>{cs ? cs.title : 'Noch nichts konfiguriert'}</p>
      <p>{cs ? cs.text : 'Links eine Kategorie wählen.'}</p>
    </div>
  )
}

function diffDataForCategory(ad: LlmConfig, cat: Category, isShared: boolean) {
  const catAxis = normalizeCat(cat.id)
  const dups = ad.duplicates.filter((d) => normalizeCat(d.cat) === catAxis)
  const coverage = ad.coverage?.filter((r) => r.cat === catAxis) ?? []
  return {
    dups: dups as DuplicateSet[],
    coverage: coverage as CoverageRow[],
    label: isShared ? 'Spiegelung' : 'Duplikate',
    badge: isShared ? coverage.length : dups.length
  }
}

function CategoryView({ ad, cat }: { ad: LlmConfig; cat: Category }) {
  const { ui, actions } = useStore()
  const isShared = ui.llm === 'shared'
  const diff = diffDataForCategory(ad, cat, isShared)
  return (
    <>
      <div className="view-head">
        <div className="view-title">
          <h2>{cat.label}</h2>
          <p>
            {cat.blurb} · <span className="mono">{cat.path}</span>
          </p>
        </div>
        <div className="mode-tabs">
          <button
            type="button"
            className={'mode-tab' + (ui.mode === 'overview' ? ' on' : '')}
            onClick={() => actions.setMode('overview')}
          >
            {Icon.list}Übersicht
          </button>
          <button
            type="button"
            className={'mode-tab' + (ui.mode === 'diff' ? ' on' : '')}
            onClick={() => actions.setMode('diff')}
          >
            {Icon.diff}{diff.label}
            {diff.badge > 0 && <span className="mt-badge">{diff.badge}</span>}
          </button>
          <button
            type="button"
            className={'mode-tab' + (ui.mode === 'compare' ? ' on' : '')}
            onClick={() => actions.setMode('compare')}
          >
            {Icon.merge}Vergleich
          </button>
        </div>
      </div>
      <ConfigDiagnostics cat={cat} />
      {ui.mode === 'overview' ? (
        <OverviewView cat={cat} onOpen={(id) => actions.openEntry(cat.id, id)} />
      ) : ui.mode === 'compare' ? (
        <CompareView cat={cat} />
      ) : isShared ? (
        <CoverageView rows={diff.coverage} />
      ) : (
        <DuplicatePanel dups={diff.dups} labels={ad.diffLabels} cat={cat} />
      )}
    </>
  )
}
