import { useState } from 'react'
import type { ImportItem, ImportStatus } from '../lib/import-targets'
import { Icon } from './Icon'
import './ImportTargetDialog.css'

// Import-Ziel-Dialog (Teil C, WP-09 UI). Reine Praesentation: listet die vom
// Gate klassifizierten Items, laesst den Owner je ready-Item die Ziel-Wurzel
// waehlen (vorbelegt suggestedRoot) und gibt bei Confirm nur die ready-Items mit
// (ggf. geaenderter) Wurzel zurueck. KEINE Schreib-/Parse-Logik hier — die liegt
// in import.ts (guard + backup-first). skipped-Items sind disabled + durchgestrichen
// mit Grund-Label. Modal-Huelle folgt dem ConfirmDialog-Pattern (cd-back/cd-card).

const REASON_LABEL: Record<Exclude<ImportStatus, 'ready'>, string> = {
  'skipped-secret': 'Secret',
  'skipped-foreign': 'Fremdpfad',
  'skipped-no-content': 'kein Inhalt'
}

interface ImportTargetDialogProps {
  items: ImportItem[]
  knownRoots: string[]
  onConfirm(picks: Array<{ index: number; chosenRoot: string }>): void
  onCancel(): void
}

// Lokaler Auswahl-State: Index -> gewaehlte Wurzel. Init aus suggestedRoot.
function initialChoices(items: ImportItem[]): Record<number, string> {
  const out: Record<number, string> = {}
  items.forEach((it, i) => {
    if (it.status === 'ready') out[i] = it.suggestedRoot
  })
  return out
}

export function ImportTargetDialog({ items, knownRoots, onConfirm, onCancel }: ImportTargetDialogProps) {
  const [choices, setChoices] = useState<Record<number, string>>(() => initialChoices(items))
  const readyCount = items.filter((it) => it.status === 'ready').length

  function confirm() {
    const picks = items
      .map((it, index) => ({ it, index }))
      .filter(({ it }) => it.status === 'ready')
      .map(({ index }) => ({ index, chosenRoot: choices[index] }))
    onConfirm(picks)
  }

  return (
    <div className="itd-back" onClick={onCancel}>
      <div className="itd-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="itd-head">
          <span className="itd-ic">{Icon.merge}</span>
          <h3>Import — Ziel-Wurzeln wählen</h3>
        </div>
        <p className="itd-detail">
          {readyCount} schreibbar, {items.length - readyCount} übersprungen. Übersprungene Einträge
          (Secret / Fremdpfad / kein Inhalt) werden nie geschrieben.
        </p>

        <ul className="itd-list">
          {items.map((it, i) => (
            <li
              key={i}
              className={`itd-row${it.status === 'ready' ? '' : ' skipped'}`}
            >
              <span className="itd-name mono">{it.name}</span>
              {it.status === 'ready' ? (
                <label className="itd-pick">
                  <span className="itd-pick-lbl">Ziel</span>
                  <select
                    className="itd-select"
                    aria-label={`Ziel-Wurzel für ${it.name}`}
                    value={choices[i] ?? it.suggestedRoot}
                    onChange={(e) => setChoices((c) => ({ ...c, [i]: e.target.value }))}
                  >
                    {knownRoots.map((root) => (
                      <option key={root} value={root}>
                        {root}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="itd-reason">{REASON_LABEL[it.status]}</span>
              )}
            </li>
          ))}
        </ul>

        <div className="itd-actions">
          <button className="itd-btn ghost" onClick={onCancel}>
            Abbrechen
          </button>
          <button className="itd-btn primary" onClick={confirm} disabled={readyCount === 0}>
            {readyCount} importieren
          </button>
        </div>
      </div>
    </div>
  )
}
