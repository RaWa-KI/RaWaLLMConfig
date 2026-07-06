import { useMemo } from 'react'
import type { Category, DuplicateSet, LlmConfig } from '@shared/contract'
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
import { buildHits } from './config-filter'

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

function ConfigMain({ ad }: { ad: LlmConfig }) {
  const { config, ui, actions } = useStore()
  const query = ui.search.trim()
  const families = config.data?.data ?? {}
  const hits = useMemo(
    () => query || ui.statusFilter !== null ? buildHits(families, ui.llm, query, ui.statusFilter) : [],
    [families, query, ui.llm, ui.statusFilter]
  )
  if (query || ui.statusFilter !== null) {
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
        hits={hits}
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
      <DiagnosticsSummary ad={ad} />
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
