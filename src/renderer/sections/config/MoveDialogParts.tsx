import type { ReactNode } from 'react'
import { SEITE_KURZ, intraSeiteKurz } from '@shared/dup-labels'
import type { MvVersion } from './move-target'

export interface ChipOption { val: string; label: string; disabled?: boolean }
export interface ChipRowProps { options: ChipOption[]; value: string; onPick(v: string): void }

export interface PickerLikeState {
  target: string
  effPath: string
}

export function buildWhatLabel(kind: 'Datei' | 'Ordner', name: string, fileCount?: number): string {
  if (kind === 'Ordner' && fileCount != null) {
    const dateien = fileCount === 1 ? '1 Datei' : `${fileCount} Dateien`
    return `${name} — ganzer Ordner mit ${dateien}`
  }
  return name
}

export function pickerValue(st: PickerLikeState): string {
  return st.target ? st.target : st.effPath
}

// Versions-Beschriftung: Bestand Shared/Claude — bei Intra-Familien-Paaren
// (fassungen gesetzt) ehrliche Fassungs-Namen (Fundstelle A = sharedPath-Slot,
// Fundstelle B = claudePath-Slot); Shared ist an solchen Paaren nicht beteiligt.
export function sideLabel(v: MvVersion, fassungen?: [string, string] | null): string {
  if (fassungen) {
    const f = intraSeiteKurz(fassungen)
    if (v === 'shared') return f.a
    if (v === 'claude') return f.b
    return f.beide
  }
  if (v === 'shared') return SEITE_KURZ.shared
  if (v === 'claude') return SEITE_KURZ.claude
  return SEITE_KURZ.beide
}

// Chip-Optionen der Versions-Wahl (aus MoveDialog ausgelagert): Beschriftung
// via sideLabel (Bestand oder Intra-Fassungen), disabled je fehlender Seite.
export function versionOptions(
  sharedPath: string | undefined,
  claudePath: string | undefined,
  fassungen?: [string, string] | null
): ChipOption[] {
  return [
    { val: 'claude', label: sideLabel('claude', fassungen), disabled: !claudePath },
    { val: 'shared', label: sideLabel('shared', fassungen), disabled: !sharedPath },
    { val: 'beide', label: sideLabel('beide', fassungen), disabled: !(sharedPath && claudePath) }
  ]
}

export function MvField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mvd-field">
      <div className="mvd-label">{label}</div>
      {children}
    </div>
  )
}

export function MvChips({ label, ...row }: ChipRowProps & { label: string }) {
  return (
    <MvField label={label}>
      <ChipRow {...row} />
    </MvField>
  )
}

export function ChipRow({ options, value, onPick }: ChipRowProps) {
  return (
    <div className="mvd-chips">
      {options.map((o) => (
        <button
          key={o.val}
          type="button"
          className={'mvd-chip' + (o.val === value ? ' active' : '')}
          disabled={o.disabled}
          onClick={() => onPick(o.val)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
