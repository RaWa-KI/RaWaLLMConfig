import type { LlmDef } from '@shared/contract'
import { Icon } from '../components/Icon'
import { useStore } from '../state/store'

// Kontextzeile (.top): Config -> LLM-Tabs + Suche; System/Updates -> Brand-Titel.
// Read-only (Phase 1): nur Anzeige + Navigation, kein AddLlm/Import/Export.
export function TopBar() {
  const { config, system, watcher, ui, actions } = useStore()
  if (ui.section === 'config') {
    const llms = config.data?.llms ?? []
    const active = llms.find((l) => l.id === ui.llm)
    return <ConfigTop llms={llms} active={active} search={ui.search} llm={ui.llm} actions={actions} />
  }
  if (ui.section === 'prefs') {
    return (
      <header className="top">
        <BrandHead variant="prefs" sub="Optik-Tweaks · jede Änderung mit Backup" />
      </header>
    )
  }
  if (ui.section === 'settings') {
    return (
      <header className="top">
        <BrandHead variant="settings" sub="Tweaks · App-Update · Quellen" />
      </header>
    )
  }
  if (ui.section === 'baum') {
    return (
      <header className="top">
        <BrandHead variant="baum" sub="Wo jede Einheit liegt — nach Ebene" />
      </header>
    )
  }
  if (ui.section === 'referenz') {
    return (
      <header className="top">
        <BrandHead variant="referenz" sub="Alles Anpassbare — Claude & Codex" />
      </header>
    )
  }
  if (ui.section === 'graph') {
    return (
      <header className="top">
        <BrandHead variant="graph" sub="graphify-Metriken & Triage je Workspace" />
      </header>
    )
  }
  if (ui.section === 'archiv') {
    return (
      <header className="top">
        <BrandHead variant="archiv" sub="Backups & Wiederherstellen — backup-first" />
      </header>
    )
  }
  if (ui.section === 'struktur') {
    return (
      <header className="top">
        <BrandHead variant="struktur" sub="Wo Duplikate & Spiegelungen liegen — Übersicht je Ebene" />
      </header>
    )
  }
  if (ui.section === 'quellen') {
    return (
      <header className="top">
        <BrandHead variant="quellen" sub="Welche Config-Ordner die App einliest — hinzufügen & verwalten" />
      </header>
    )
  }
  const isSystem = ui.section === 'system'
  const sub = isSystem
    ? subSystem(system.data?.areas.length, system.data?.updated)
    : subUpdates(watcher.data?.daemon.sources, watcher.data?.daemon.status)
  return (
    <header className="top">
      <BrandHead variant={isSystem ? 'system' : 'updates'} sub={sub} />
    </header>
  )
}

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
  prefs: { tone: 'var(--terra)', icon: 'edit', title: 'Tweaks & Einstellungen' },
  baum: { tone: 'var(--terra)', icon: 'map', title: 'Pfad-Baum' },
  referenz: { tone: 'var(--terra)', icon: 'book', title: 'Referenz · Landkarte' },
  graph: { tone: 'var(--sage)', icon: 'net', title: 'Graph · Wissen' },
  archiv: { tone: 'var(--papa)', icon: 'snap', title: 'Archiv · Wiederherstellen' },
  struktur: { tone: 'var(--sage)', icon: 'layers', title: 'Struktur-Scan' },
  quellen: { tone: 'var(--terra)', icon: 'folder', title: 'Config-Quellen' }
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
    </header>
  )
}

function LlmTab({ def, active, onPick }: { def: LlmDef; active: boolean; onPick: () => void }) {
  const cls = 'llm-tab' + (active ? ' on' : '') + (def.coming ? ' coming' : '')
  return (
    <button
      className={cls}
      onClick={() => {
        if (!def.coming) onPick()
      }}
    >
      <span className="lt-dot" style={{ background: def.color }}></span>
      <span className="lt-meta">
        <span className="lt-name">{def.name}</span>
        <span className="lt-sub">{def.sub}</span>
      </span>
      {def.scanError && <span className="lt-tag err" title={def.scanError}>Fehler</span>}
      {def.coming && <span className="lt-tag">bald</span>}
    </button>
  )
}

// Dynamischer Gradient aus LLM-/Sektion-Farbe (statische Optik kommt aus .mark).
function markGradient(c: string) {
  return `linear-gradient(150deg, ${c}, color-mix(in oklab, ${c} 75%, #000))`
}
