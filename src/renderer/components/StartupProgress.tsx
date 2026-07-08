import './StartupProgress.css'

interface StartupProgressProps {
  loading: {
    sources: boolean
    config: boolean
    system: boolean
    watcher: boolean
  }
}

const STEPS = [
  { id: 'sources', label: 'Quellen' },
  { id: 'config', label: 'Konfiguration' },
  { id: 'system', label: 'System' },
  { id: 'watcher', label: 'Hinweise' }
] as const

type StartupStepId = typeof STEPS[number]['id']

export function StartupProgress({ loading }: StartupProgressProps) {
  const completed = STEPS.filter((step) => !loading[step.id]).length
  if (completed === STEPS.length) return null
  const percent = Math.max(8, Math.round((completed / STEPS.length) * 100))
  const active = STEPS.find((step) => loading[step.id])?.id ?? null
  return (
    <section className="startup-progress" aria-live="polite" aria-label="Startstatus">
      <div className="startup-progress-copy">
        <strong>Lokale Übersicht wird vorbereitet</strong>
        <span>{startupStatusText(active)}</span>
      </div>
      <div className="startup-progress-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="startup-progress-steps">
        {STEPS.map((step) => (
          <li
            key={step.id}
            className={stepClassName(step.id, active, loading[step.id])}
          >
            <span />
            {step.label}
          </li>
        ))}
      </ol>
    </section>
  )
}

function stepClassName(id: StartupStepId, active: StartupStepId | null, loading: boolean): string {
  if (!loading) return 'done'
  return id === active ? 'active' : 'pending'
}

function startupStatusText(active: StartupStepId | null): string {
  if (active === 'sources') return 'Quellen und Ordner werden geladen.'
  if (active === 'config') return 'Einstellungen werden gelesen.'
  if (active === 'system') return 'Lokale Systemdaten werden geprüft.'
  if (active === 'watcher') return 'Dauerhafte Hinweise werden abgeglichen.'
  return 'Start wird abgeschlossen.'
}
