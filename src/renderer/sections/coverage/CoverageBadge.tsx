import type { CoverageState } from '@shared/contract-coverage'

// CoverageBadge — Status-Badge fuer eine Spiegelungs-Zelle.
// Farben ausschliesslich ueber Design-Tokens (keine Hardcode-Farben).
// Badge-Klassen matchen die bestehende .pill-Struktur aus components.css;
// coverage-spezifische Varianten werden in CoverageView.css ergaenzt.

const BADGE_CLASS: Record<CoverageState, string> = {
  identisch:   'cvg-badge cvg-badge--identisch',
  abweichend:  'cvg-badge cvg-badge--abweichend',
  fehlt:       'cvg-badge cvg-badge--fehlt',
  'via-plugin':'cvg-badge cvg-badge--via-plugin',
  'n-a':       'cvg-badge cvg-badge--na',
  vorhanden:   'cvg-badge cvg-badge--vorhanden',
}

const BADGE_LABEL: Record<CoverageState, string> = {
  identisch:   'identisch',
  abweichend:  'abweichend',
  fehlt:       'fehlt',
  'via-plugin':'Plugin-Indiz',
  'n-a':       'n/a',
  vorhanden:   'vorhanden',
}

interface CoverageBadgeProps {
  state: CoverageState
  path?: string
  note?: string
}

function badgeTitle(state: CoverageState, path?: string, note?: string): string {
  const base = path ?? BADGE_LABEL[state]
  const suffix = state === 'via-plugin' && !note ? 'Plugin-Indiz, kein Dateinachweis.' : note
  return suffix ? `${base} - ${suffix}` : base
}

export function CoverageBadge({ state, path, note }: CoverageBadgeProps) {
  return (
    <span className={BADGE_CLASS[state]} title={badgeTitle(state, path, note)}>
      <span className="cvg-badge-dot" aria-hidden="true" />
      {BADGE_LABEL[state]}
    </span>
  )
}
