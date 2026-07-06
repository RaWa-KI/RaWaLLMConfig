import { useStore } from '../state/store'
import { Icon } from '../components/Icon'
import { exportBundle, exportConflictBundle } from '../lib/export'
import { parseImportSource, applyImportItems } from '../lib/import'
import { knownRootsFromConfig } from '../lib/known-roots'
import { ImportTargetDialog } from '../components/ImportTargetDialog'
import type { Section } from '../state/types'

// Zeile-1-Leiste: Bereichs-Umschalter (Config/System/Updates) + Export/Import.
// Import: .json-Bundle ODER rohe .md -> Ziel-Dialog -> Owner-Confirm -> Write
// (guard + backup-first via applyImportItems). Secret-/Fremdpfade werden sichtbar
// uebersprungen und NIE geschrieben. Cancel schliesst ohne jeden Disk-Write.

const SECTIONS: ReadonlyArray<{ id: Section; label: string; icon: string }> = [
  { id: 'config', label: 'Config', icon: 'gear' },
  { id: 'baum', label: 'Baum', icon: 'map' },
  { id: 'referenz', label: 'Referenz', icon: 'book' },
  { id: 'graph', label: 'Graph', icon: 'net' },
  { id: 'system', label: 'System', icon: 'cpu' },
  { id: 'updates', label: 'Updates', icon: 'refresh' },
  { id: 'settings', label: 'Einstellungen', icon: 'edit' },
  { id: 'struktur', label: 'Struktur', icon: 'layers' },
  { id: 'archiv', label: 'Archiv', icon: 'snap' }
]

function alertCount(sources: readonly { state: string }[] | undefined): number {
  if (!sources) return 0
  return sources.filter((s) => s.state !== 'current').length
}

interface SwitchProps {
  active: Section
  updAlerts: number
  onSelect(id: Section): void
}

function SectionSwitch({ active, updAlerts, onSelect }: SwitchProps) {
  return (
    <div className="section-switch">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          className={'sec-btn' + (active === s.id ? ' on' : '')}
          onClick={() => onSelect(s.id)}
        >
          {Icon[s.icon]}
          {s.label}
          {s.id === 'updates' && updAlerts > 0 && <span className="sb-badge">{updAlerts}</span>}
        </button>
      ))}
    </div>
  )
}

export function LlmBar() {
  const { config, system, watcher, ui, actions } = useStore()
  const updAlerts = alertCount(watcher.data?.sources)

  const onExport = () => {
    exportBundle({ config: config.data, system: system.data, watcher: watcher.data })
    actions.showToast('Export erstellt', 'save')
  }
  const onConflictExport = () => {
    const count = exportConflictBundle({ config: config.data, system: system.data, watcher: watcher.data })
    actions.showToast(count > 0 ? `${count} Konflikte exportiert` : 'Keine Konflikte im Snapshot', count > 0 ? 'save' : 'check')
  }

  // Datei waehlen -> klassifizieren (Secret/Fremd/leer sichtbar markiert) ->
  // Ziel-Dialog oeffnen. Hier wird NICHT geschrieben (erst nach Owner-Confirm).
  const onImport = async (file: File) => {
    const knownRoots = knownRootsFromConfig(config.data)
    if (knownRoots.length === 0) {
      actions.showToast('Import nicht möglich — keine schreibbaren Config-Wurzeln gefunden (Config geladen?)', 'warn')
      return
    }
    const res = await parseImportSource(file, knownRoots)
    if (!res.valid) {
      actions.showToast(res.message, 'warn')
      return
    }
    actions.openImportDialog({ items: res.items, knownRoots })
  }

  // Owner-Confirm: nur ready-Picks (index->item) mit gewaehlter Wurzel an die
  // Write-API (guard + backup-first). Dialog schliessen, Ergebnis als Toast.
  const onImportConfirm = async (picks: Array<{ index: number; chosenRoot: string }>) => {
    const dlg = ui.importDialog
    actions.closeImportDialog()
    if (!dlg) return
    const built = picks.map((p) => ({
      name: dlg.items[p.index].name,
      content: dlg.items[p.index].content,
      chosenRoot: p.chosenRoot
    }))
    const res = await applyImportItems(built)
    actions.showToast(res.message, res.ok ? 'check' : 'warn')
  }

  return (
    <>
    <div className="llmbar">
      <div className="llm-brand">
        <div className="lb-mark">{Icon.gear}</div>
        <div>
          Config<div className="lb-sub">LLM- &amp; System-Übersicht</div>
        </div>
      </div>
      <div className="llm-divider" />
      <SectionSwitch active={ui.section} updAlerts={updAlerts} onSelect={actions.setSection} />
      <div className="spacer" />
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="btn ghost sm" onClick={onExport} title="Gesamte Config als JSON exportieren">
          {Icon.save}Export
        </button>
        <button type="button" className="btn ghost sm" onClick={onConflictExport} title="Nur Konflikte als JSON exportieren">
          {Icon.warn}Konflikte
        </button>
        <label className="btn ghost sm" style={{ cursor: 'pointer' }} title="Export-Bundle (.json) oder Markdown (.md) importieren — Ziel-Wahl + Owner-Confirm">
          {Icon.up}Import
          <input
            type="file"
            accept=".json,.md,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    </div>
    {ui.importDialog && (
      <ImportTargetDialog
        items={ui.importDialog.items}
        knownRoots={ui.importDialog.knownRoots}
        onConfirm={(picks) => void onImportConfirm(picks)}
        onCancel={actions.closeImportDialog}
      />
    )}
    </>
  )
}
