import { useState } from 'react'
import type { SystemArea, SystemEntry } from '@shared/contract'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { Pill } from '../../components/Pill'
import { WriteModeBanner } from '../../components/WriteModeBanner'
import { SystemEntryDetail } from './SystemEntryDetail'
import './SystemSection.css'

// System-Umgebung: Bereiche links, Eintraege rechts.
// Eintraege sind aufklappbar (Chevron); bei writeEnabled sind Felder editierbar.
// Nie Secrets — nur Namen/Status/Felder.
export function SystemSection() {
  const { system, ui, actions } = useStore()
  const data = system.data
  if (!data) return <SystemEmpty error={system.error} loading={system.loading} />

  const areas = data.areas
  const area = areas.find((a) => a.id === ui.sysArea) ?? areas[0]
  if (!area) return <SystemEmpty error={null} loading={false} />

  return (
    <>
      <SystemSidebar areas={areas} sysArea={area.id} updated={data.updated} onPick={actions.setSysArea} />
      <main className="main">
        <div className="view-head">
          <div className="view-title">
            <h2>{area.label}</h2>
            <p>{area.blurb}</p>
          </div>
          <RefreshVersionsButton onReload={actions.reload} />
        </div>
        {/* WP-S: schlanker Schreibmodus-Indikator direkt in der System-Ansicht
            (der globale Indikator ist hier in App.tsx unterdrueckt, kein
            Doppel-Indikator). Owner-Entscheid 14:33: kein Aktivieren-Schalter
            mehr — Schreibmodus default AN; der Indikator zeigt nur den Zustand. */}
        <div className="sys-write-bar">
          <WriteModeBanner />
        </div>
        <AreaEntries area={area} />
      </main>
    </>
  )
}

// Versions-Refresh (PERF-HOCH-01): leert den CLI-Versions-Cache im Main und
// laedt danach via actions.reload() ALLES frisch — BEWUSST Voll-Reload, weil
// System UND Watcher neue Versions-Spawns brauchen (reloadConfig() ist nur
// fuer Write-Pfade und liesse System/Watcher stale). Read-only Owner-Aktion:
// kein Write-Gate, kein Confirm (Owner-Grundprinzip).
function RefreshVersionsButton({ onReload }: { onReload(): void }) {
  const [busy, setBusy] = useState(false)
  const onClick = async (): Promise<void> => {
    const api = window.electronAPI
    if (!api || busy) return
    setBusy(true)
    try {
      await api.refreshVersions()
      onReload()
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className="btn-ghost" disabled={busy} onClick={() => void onClick()}>
      {Icon.refresh}
      {busy ? 'Aktualisiere …' : 'Versionen aktualisieren'}
    </button>
  )
}

function SystemSidebar(props: {
  areas: SystemArea[]
  sysArea: string
  updated: string
  onPick(id: string): void
}) {
  const { areas, sysArea, updated, onPick } = props
  return (
    <aside className="sidebar">
      <div className="side-label">System-Umgebung</div>
      {areas.map((a) => (
        <AreaNavItem key={a.id} area={a} active={a.id === sysArea} onPick={onPick} />
      ))}
      <div className="nav-sep" />
      <div className="side-note">
        {areas.length} Bereiche · Stand {updated}. Nur Namen, nie Secrets.
      </div>
    </aside>
  )
}

function AreaNavItem(props: { area: SystemArea; active: boolean; onPick(id: string): void }) {
  const { area, active, onPick } = props
  const flag = area.entries.some((e) => e.status === 'conflict')
    ? 'var(--terra)'
    : area.entries.some((e) => e.status === 'stale')
      ? 'var(--amber)'
      : null
  return (
    <button type="button" className={'nav-item' + (active ? ' on' : '')} onClick={() => onPick(area.id)}>
      <span className="ni-ic">{Icon[area.icon]}</span>
      <span className="ni-txt">{area.label}</span>
      {flag && <span className="ni-flag" style={{ background: flag }} />}
      <span className="ni-count">{area.entries.length}</span>
    </button>
  )
}

function AreaEntries({ area }: { area: SystemArea }) {
  if (area.entries.length === 0) {
    return (
      <div className="empty">
        {Icon[area.icon]}
        <p>Keine Einträge in diesem Bereich.</p>
      </div>
    )
  }
  return (
    <div className="rows">
      {area.entries.map((e, i) => (
        <EntryRow key={e.id ?? `${area.id}-${i}`} icon={area.icon} entry={e} areaId={area.id} />
      ))}
    </div>
  )
}

function EntryRow({ icon, entry, areaId }: { icon: string; entry: SystemEntry; areaId: string }) {
  const [open, setOpen] = useState(false)
  const hasFields = entry.fields && Object.keys(entry.fields).length > 0

  return (
    <div className={'row' + (open ? ' row-open' : '')}>
      <div
        onClick={() => hasFields && setOpen((o) => !o)}
        className={'row-summary' + (hasFields ? ' row-summary-clickable' : '')}
      >
        <div className="row-ic">{Icon[icon]}</div>
        <div className="row-main">
          <div className="row-name">
            <span>{entry.name}</span>
          </div>
          <div className="row-desc">{entry.desc}</div>
          {entry.status === 'conflict' && entry.conflictReason && (
            <span className="deh-conflict">
              <span className="dc-ic">{Icon.warn}</span>
              {entry.conflictReason}
            </span>
          )}
        </div>
        <div className="row-meta">
          {entry.v && <span className="vchip">{entry.v}</span>}
          <Pill status={entry.status} />
          {hasFields && (
            <span className={'chev' + (open ? ' chev-open' : '')}>{Icon.chev}</span>
          )}
        </div>
      </div>
      {open && hasFields && (
        <SystemEntryDetail areaId={areaId} entry={entry} />
      )}
    </div>
  )
}

function SystemEmpty({ error, loading }: { error: string | null; loading: boolean }) {
  const msg = error ?? (loading ? 'Lädt System-Umgebung …' : 'Keine System-Daten verfügbar.')
  return (
    <main className="main">
      <div className="empty-state">
        {Icon.gear}
        <p>{msg}</p>
      </div>
    </main>
  )
}
