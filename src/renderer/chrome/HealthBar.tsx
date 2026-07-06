import { useStore } from '../state/store'
import { Icon } from '../components/Icon'
import type { EntryStatus, LlmConfig } from '@shared/contract'

// Health-Leiste fuer die Config-Sektion (Referenz app.jsx .health).
// Read-only: zaehlt Status ueber alle Eintraege; Duplikate aus duplicates.length.
// Alle vier Chips sind jetzt <button>; aktiv/veraltet/Konflikte setzen den echten
// statusFilter im Store (Toggle); Duplikate oeffnet Diff-Modus (null-guard gegen
// leere Kategorie). Aktiver Chip ist optisch markiert (.on).

interface Counts {
  active: number
  stale: number
  conflict: number
  dup: number
}

function countHealth(cfg: LlmConfig): Counts {
  let active = 0
  let stale = 0
  let conflict = 0
  for (const c of cfg.categories) {
    for (const e of c.entries) {
      if (e.status === 'active') active++
      else if (e.status === 'stale') stale++
      else if (e.status === 'conflict') conflict++
    }
  }
  return { active, stale, conflict, dup: cfg.duplicates.length }
}

// Sammelt fuer den Konflikte-Chip-Tooltip alle conflict-Eintraege als
// "<name> — <conflictReason>"-Zeilen. Ohne conflictReason nur der Name.
// Leer => kein Tooltip (return '').
function conflictTooltip(cfg: LlmConfig): string {
  const lines: string[] = []
  for (const c of cfg.categories) {
    for (const e of c.entries) {
      if (e.status !== 'conflict') continue
      lines.push(e.conflictReason ? `${e.name} — ${e.conflictReason}` : e.name)
    }
  }
  return lines.join('\n')
}

function firstDupCat(cfg: LlmConfig): string | null {
  // Defensiv: nur eine Kategorie ansteuern, die wirklich existiert
  // (sonst Empty-State). Erste Dublette mit gueltiger Heimat-Kategorie.
  const catIds = new Set(cfg.categories.map((c) => c.id))
  const d = cfg.duplicates.find((x) => catIds.has(x.cat))
  return d ? d.cat : null
}

export function HealthBar() {
  const { config, ui, actions } = useStore()
  const data = config.data
  const cfg = data?.data[ui.llm]
  if (!data || !cfg) return null

  const h = countHealth(cfg)
  const snap = data.snapshot
  const active = ui.statusFilter
  const confTip = conflictTooltip(cfg)

  // Setzt den echten statusFilter (Toggle ueber den Store) und navigiert in die
  // Config-Uebersicht; buildHits filtert dann nach entry.status.
  const filterByStatus = (status: EntryStatus) => {
    actions.setSection('config')
    actions.setMode('overview')
    actions.toggleStatusFilter(status)
  }

  // Duplikate: Diff-Modus oeffnen; null-guard gegen leere Kategorie.
  const openDiff = () => {
    const cat = firstDupCat(cfg)
    if (!cat) {
      actions.showToast('Keine Duplikate', 'check')
      return
    }
    actions.setCatId(cat)
    actions.setMode('diff')
  }

  return (
    <div className="health">
      <button
        type="button"
        className={'hstat ok' + (active === 'active' ? ' on' : '')}
        onClick={() => filterByStatus('active')}
      >
        <span className="dot" /><span className="n">{h.active}</span>aktiv
      </button>
      <button type="button" className="hstat dup" onClick={openDiff}>
        <span className="dot" /><span className="n">{h.dup}</span>Duplikate
      </button>
      <button
        type="button"
        className={'hstat stale' + (active === 'stale' ? ' on' : '')}
        onClick={() => filterByStatus('stale')}
      >
        <span className="dot" /><span className="n">{h.stale}</span>veraltet
      </button>
      <button
        type="button"
        className={'hstat conf' + (active === 'conflict' ? ' on' : '')}
        onClick={() => filterByStatus('conflict')}
        title={confTip || undefined}
      >
        <span className="dot" /><span className="n">{h.conflict}</span>Konflikte
      </button>
      {cfg.scanError && (
        <span className="hstat scan-err" title={cfg.scanError}>
          <span className="dot" />Scan-Fehler
        </span>
      )}
      <span className="snap">{Icon.snap}<span>Snapshot&nbsp;<b>{snap.label}</b>&nbsp;· live · Stand {snap.date}</span></span>
    </div>
  )
}
