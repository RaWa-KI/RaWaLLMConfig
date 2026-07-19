import type { LlmDef } from '@shared/contract'
import { Icon } from '../components/Icon'
import { DisplayModeSwitch } from '../components/DisplayModeSwitch'
import { useDisplayModeSwitch } from '../components/useDisplayModeSwitch'
import { useStore } from '../state/store'
import type { Section } from '../state/types'

// Kontextzeile (.top): Config -> LLM-Tabs + Suche; System/Updates -> Brand-Titel.
// Read-only (Phase 1): nur Anzeige + Navigation, kein AddLlm/Import/Export.
// Teil E (D1): kompakter simple/expert-Umschalter rechts in jeder TopBar-Variante —
// derselbe Kern wie im Settings-Aktionspanel (components/DisplayModeSwitch).
export function TopBar() {
  const { config, ui, actions } = useStore()
  if (ui.section === 'config') {
    const llms = config.data?.llms ?? []
    const active = llms.find((l) => l.id === ui.llm)
    return <ConfigTop llms={llms} active={active} search={ui.search} llm={ui.llm} actions={actions} />
  }
  return <BrandSectionTop section={ui.section} />
}

// HR27-Split aus TopBar: Brand-Variante + Untertitel je Sektion bestimmen und
// mit dem Modus-Umschalter komponieren.
function BrandSectionTop({ section }: { section: Section }) {
  const { system, watcher } = useStore()
  const variant = SECTION_BRAND[section] ?? 'updates'
  return (
    <header className="top">
      <BrandHead variant={variant} sub={brandSub(variant, system.data, watcher.data)} />
      <div className="spacer" />
      <TopBarModeSwitch />
    </header>
  )
}

// Umschalter mit Store-Anbindung; die Darstellung bleibt beim gemeinsamen Kern.
// Teilplan F: optimistisch (useDisplayModeSwitch) — on sofort, Re-Render als Transition.
function TopBarModeSwitch() {
  const { active, onSelect } = useDisplayModeSwitch()
  return <DisplayModeSwitch active={active} onSelect={onSelect} />
}

const SECTION_BRAND: Partial<Record<Section, BrandVariant>> = {
  prefs: 'prefs',
  settings: 'settings',
  baum: 'baum',
  referenz: 'referenz',
  graph: 'graph',
  archiv: 'archiv',
  struktur: 'struktur',
  quellen: 'quellen',
  system: 'system'
}

function brandSub(variant: BrandVariant, system: SystemData, watcher: WatcherData): string {
  if (variant === 'system') return subSystem(system?.areas.length, system?.updated)
  if (variant === 'updates') return subUpdates(watcher?.daemon.sources, watcher?.daemon.status)
  return BRAND_SUBS[variant]
}

type SystemData = ReturnType<typeof useStore>['system']['data']
type WatcherData = ReturnType<typeof useStore>['watcher']['data']

function subSystem(count?: number, updated?: string) {
  const c = count ?? 0
  return `${c} Bereiche${updated ? ` · Stand ${updated}` : ''}`
}

function subUpdates(sources?: number, status?: string) {
  const s = sources ?? 0
  return `${s} Quellen${status ? ` · Daemon ${status}` : ''}`
}

type BrandVariant = 'system' | 'updates' | 'settings' | 'prefs' | 'baum' | 'referenz' | 'graph' | 'archiv' | 'struktur' | 'quellen'

const BRAND: Record<BrandVariant, { tone: string; icon: string; title: string }> = {
  system: { tone: 'var(--sage)', icon: 'cpu', title: 'System-Umgebung' },
  updates: { tone: 'var(--papa)', icon: 'refresh', title: 'Toolchain-Watcher' },
  settings: { tone: 'var(--terra)', icon: 'edit', title: 'Einstellungen' },
  prefs: { tone: 'var(--terra)', icon: 'edit', title: 'Darstellung' },
  baum: { tone: 'var(--terra)', icon: 'map', title: 'Pfad-Baum' },
  referenz: { tone: 'var(--terra)', icon: 'book', title: 'Hilfe & Arbeitsumgebung' },
  graph: { tone: 'var(--sage)', icon: 'net', title: 'Graph · Wissen' },
  archiv: { tone: 'var(--papa)', icon: 'snap', title: 'Archiv · Wiederherstellen' },
  struktur: { tone: 'var(--sage)', icon: 'layers', title: 'Struktur-Scan' },
  quellen: { tone: 'var(--terra)', icon: 'folder', title: 'Zusätzliche Ordner' }
}

const BRAND_SUBS: Record<Exclude<BrandVariant, 'system' | 'updates'>, string> = {
  settings: 'Darstellung · Dateien · Updates · Quellen · Module',
  prefs: 'Darstellung · jede Änderung mit Backup',
  baum: 'Wo jede Einheit liegt — nach Ebene',
  referenz: 'Befehle, Regeln und technische Landkarte',
  graph: 'graphify-Metriken & Triage je Workspace',
  archiv: 'Backups & Wiederherstellen — backup-first',
  struktur: 'Wo Duplikate & Spiegelungen liegen — Übersicht je Ebene',
  quellen: 'Zusätzliche Ordner hinzufügen und verwalten'
}

function BrandHead({ variant, sub }: { variant: BrandVariant; sub: string }) {
  const b = BRAND[variant]
  return (
    <div className="brand">
      <div className="mark" style={{ background: markGradient(b.tone) }}>
        {Icon[b.icon]}
      </div>
      <div>
        <h1>{b.title}</h1>
        <div className="sub">{sub}</div>
      </div>
    </div>
  )
}

interface ConfigTopProps {
  llms: LlmDef[]
  active?: LlmDef
  search: string
  llm: string
  actions: ReturnType<typeof useStore>['actions']
}

function ConfigTop({ llms, active, search, llm, actions }: ConfigTopProps) {
  const color = active?.color ?? 'var(--terra)'
  return (
    <header className="top">
      <div className="mark" style={{ background: markGradient(color), width: 40, height: 40, fontSize: 19 }}>
        {active?.glyph}
      </div>
      <div className="llm-tabs">
        {llms.map((l) => (
          <LlmTab key={l.id} def={l} active={l.id === llm} onPick={() => actions.setLlm(l.id)} />
        ))}
      </div>
      <div className="spacer"></div>
      <div className="search">
        <span>{Icon.search}</span>
        <input
          value={search}
          onChange={(e) => actions.setSearch(e.target.value)}
          placeholder={`In ${active?.name ?? '…'} suchen …`}
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            aria-label="Suche löschen"
            onClick={() => actions.setSearch('')}
          >
            ×
          </button>
        )}
      </div>
      <TopBarModeSwitch />
    </header>
  )
}

function LlmTab({ def, active, onPick }: { def: LlmDef; active: boolean; onPick: () => void }) {
  const cls = 'llm-tab' + (active ? ' on' : '')
  return (
    <button className={cls} onClick={onPick}>
      <span className="lt-dot" style={{ background: def.color }}></span>
      <span className="lt-meta">
        <span className="lt-name">{def.name}</span>
        <span className="lt-sub">{def.sub}</span>
      </span>
      {def.scanError && <span className="lt-tag err" title={def.scanError}>Fehler</span>}
    </button>
  )
}

// Dynamischer Gradient aus LLM-/Sektion-Farbe (statische Optik kommt aus .mark).
function markGradient(c: string) {
  return `linear-gradient(150deg, ${c}, color-mix(in oklab, ${c} 75%, #000))`
}
