import type { EntryStatus, Scope } from '@shared/contract'

// Read-only Status-/Scope-Pills (1:1 Optik aus Prototyp app.jsx STATUS/SCOPE_LABEL).
const STATUS: Record<EntryStatus, { label: string; cls: string }> = {
  active: { label: 'aktiv', cls: 'active' },
  stale: { label: 'veraltet', cls: 'stale' },
  conflict: { label: 'Konflikt', cls: 'conflict' },
  dup: { label: 'Duplikat', cls: 'dup' },
  archived: { label: 'archiviert', cls: 'archived' }
}

const SCOPE_LABEL: Record<Scope, string> = {
  managed: 'Managed',
  global: 'Global',
  project: 'Projekt',
  local: 'Lokal',
  shared: 'Geteilt'
}

export function Pill({ status }: { status: EntryStatus }) {
  const s = STATUS[status] ?? STATUS.active
  return (
    <span className={'pill ' + s.cls}>
      <span className="pd" />
      {s.label}
    </span>
  )
}

export function ScopePill({ scope }: { scope: Scope }) {
  return <span className="pill ghost">{SCOPE_LABEL[scope] ?? scope}</span>
}
