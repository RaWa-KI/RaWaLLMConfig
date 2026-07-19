import { Suspense, lazy, useCallback, useEffect, useMemo, useRef } from 'react'
import type { AppData, Category, DuplicateSet, LlmConfig } from '@shared/contract'
import type { CoverageRow } from '@shared/contract-coverage'
import { normalizeCat } from '@shared/cat-key'
import { useStore } from '../../state/store'
import type { Mode } from '../../state/types'
import { Icon } from '../../components/Icon'
import { FocusNotice } from '../../components/FocusNotice'
import { SectionFallback } from '../../components/SectionFallback'
import { readOverviewFocus } from '../overview/overview-navigation'
import { OverviewView, SearchView, type SearchHit } from './config-parts'
import { DuplicatePanel } from './DuplicatePanel'
import { ConfigWriteConfirm } from './ConfigWriteConfirm'
import { ConfigDiagnostics } from './ConfigDiagnostics'
import { DiagnosticsSummary } from './DiagnosticsSummary'
import { CategoryModeTabs } from './CategoryModeTabs'
import { categoryLabel } from './category-label'
import { buildHits } from './config-filter'
import { resolveConfigFocus } from './config-focus'

// Vergleich/Spiegelung als Lazy-Chunks (Teilplan C): selten geoeffnete,
// datenreiche Views loesen sich aus dem Startbundle.
const CompareView = lazy(() => import('../compare/CompareView').then((m) => ({ default: m.CompareView })))
const CoverageView = lazy(() => import('../coverage/CoverageView').then((m) => ({ default: m.CoverageView })))

// Config-Sektion: Kategorie-Sidebar + Anzeige (Uebersicht / Duplikate) oder
// Suchtreffer. WP-D-a: EntryDetailPanel als Overlay entfernt (dual-drawer-overlay-
// occludes-editpanel); Detail laeuft nur noch ueber den Drawer-Tab 'detail'.
// EntryDetailPanel-Import entfernt — Komponente bleibt im Codebase (HR7).
export function ConfigSection() {
  const { config, ui, actions } = useStore()
  useConfigOverviewFocus(config.data)
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
        <FocusNotice section="config" />
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

function useConfigOverviewFocus(data: AppData | null) {
  const { ui, actions } = useStore()
  const applied = useRef('')
  useEffect(() => {
    const focus = readOverviewFocus('config')
    const target = resolveConfigFocus(data, focus?.focusId)
    if (!focus?.focusId || !target) return
    const key = `${focus.focusId}:${target.llm}:${target.catId}:${target.entryId}`
    if (applied.current === key) return
    if (ui.llm !== target.llm) {
      actions.setLlm(target.llm)
      return
    }
    if (ui.search.trim()) actions.setSearch('')
    if (ui.statusFilter !== null) actions.toggleStatusFilter(ui.statusFilter)
    if (ui.catId !== target.catId) actions.setCatId(target.catId)
    if (ui.mode !== 'overview') actions.setMode('overview')
    if (ui.sel?.catId !== target.catId || ui.sel.entryId !== target.entryId) {
      actions.openEntry(target.catId, target.entryId)
    }
    applied.current = key
  }, [actions, data, ui.catId, ui.llm, ui.mode, ui.search, ui.sel, ui.statusFilter])
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
  const { ui } = useStore()
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
            <span className="ni-txt">{categoryLabel(ui.displayMode, c)}</span>
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
  const allFamilies = config.data?.data
  // audit ist Register-only (Masterplan Teil E): Suche/Nav ueber data-Keys
  // exkludiert, damit kein Suchtreffer setLlm('audit') ausloesen kann.
  const families = useMemo(
    () => Object.fromEntries(Object.entries(allFamilies ?? {}).filter(([id]) => id !== 'audit')),
    [allFamilies]
  )
  const hits = useMemo(
    () => query || ui.statusFilter !== null ? buildHits(families, ui.llm, query, ui.statusFilter) : [],
    [families, query, ui.llm, ui.statusFilter]
  )
  // Stabiler Treffer-Handler (Teilplan C): SearchHitRow/EntryRow sind memoized,
  // ein frischer Inline-Handler pro Render wuerde das memo aushebeln. Hook steht
  // bewusst VOR dem early return (Rules of Hooks).
  const openHit = useCallback(
    (llm: string, catId: string, entryId: string) => {
      if (llm !== ui.llm) actions.setLlm(llm)
      actions.openEntry(catId, entryId)
    },
    [actions, ui.llm]
  )
  if (query || ui.statusFilter !== null) {
    // Treffer oeffnen. Gleiche Familie: Drawer oeffnet direkt (unveraendert).
    // Fremde Familie: erst Familie wechseln, damit der Eintrag dort sichtbar ist.
    // Hinweis: der Store-Effekt (store.tsx) leert bei echtem Familienwechsel
    // Auswahl + Suche, daher oeffnet ein Fremd-Treffer den Drawer NICHT im selben
    // Klick — der Owner landet in der Ziel-Familie und oeffnet dort. Ein
    // gekoppeltes Fremd-Oeffnen braucht eine Store-Anpassung (ausserhalb dieses
    // Write-Sets, als needs-shared-file gemeldet).
    return (
      <SearchView
        hits={hits}
        query={query}
        statusFilter={ui.statusFilter}
        onOpen={openHit}
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

// Body-Weiche der Kategorie: Uebersicht / Vergleich / Spiegelung / Duplikate.
// Aus CategoryView extrahiert (HR27-Funktionslimit). Vergleich/Spiegelung sind
// Lazy-Chunks und haengen an eigenen Suspense-Grenzen (Teilplan C).
function CategoryBody({
  ad,
  cat,
  mode,
  isShared,
  diff,
  openEntry
}: {
  ad: LlmConfig
  cat: Category
  mode: Mode
  isShared: boolean
  diff: ReturnType<typeof diffDataForCategory>
  openEntry(id: string): void
}) {
  if (mode === 'overview') return <OverviewView cat={cat} onOpen={openEntry} />
  if (mode === 'compare') {
    return (
      <Suspense fallback={<SectionFallback label="Vergleich wird geladen …" />}>
        <CompareView cat={cat} />
      </Suspense>
    )
  }
  if (isShared) {
    return (
      <Suspense fallback={<SectionFallback label="Spiegelung wird geladen …" />}>
        <CoverageView rows={diff.coverage} />
      </Suspense>
    )
  }
  return <DuplicatePanel dups={diff.dups} labels={ad.diffLabels} cat={cat} />
}

function CategoryView({ ad, cat }: { ad: LlmConfig; cat: Category }) {
  const { ui, actions } = useStore()
  const isShared = ui.llm === 'shared'
  const diff = diffDataForCategory(ad, cat, isShared)
  // DisplayMode-Weiche (Teil E, Owner-Entscheid D1–D3): simple sieht keine Pfade,
  // keine Register-Modi (Spiegelung/Vergleich) und keine Diff-Zeilen. Bleibt der
  // gespeicherte Modus fuer simple unzulaessig, faellt die Anzeige auf Uebersicht
  // zurueck — ohne State-Eingriff (Wechsel zu expert zeigt den Modus wieder).
  const expert = ui.displayMode === 'expert'
  const mode: Mode = expert || (ui.mode === 'overview' || (ui.mode === 'diff' && !isShared)) ? ui.mode : 'overview'
  // Stabiler Open-Callback (Teilplan C): Inline-Arrow wuerde die Referenz brechen.
  const openEntry = useCallback((id: string) => actions.openEntry(cat.id, id), [actions, cat.id])
  return (
    <>
      <div className="view-head">
        <div className="view-title">
          <h2>{categoryLabel(ui.displayMode, cat)}</h2>
          <p>
            {cat.blurb}
            {expert && <> · <span className="mono">{cat.path}</span></>}
          </p>
        </div>
        <CategoryModeTabs
          displayMode={ui.displayMode}
          mode={ui.mode}
          isShared={isShared}
          mirrorLabel={diff.label}
          diffBadge={diff.badge}
          onMode={actions.setMode}
        />
      </div>
      <DiagnosticsSummary ad={ad} />
      <ConfigDiagnostics cat={cat} />
      <CategoryBody ad={ad} cat={cat} mode={mode} isShared={isShared} diff={diff} openEntry={openEntry} />
    </>
  )
}
