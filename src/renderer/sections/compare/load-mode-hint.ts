import type { LoadMode } from '@shared/contract'
import type { LoadHint } from './load-semantics'

const MODE_HINTS: Record<LoadMode, LoadHint> = {
  immer: {
    when: 'immer',
    control: 'Scanner-Wahrheit: diese Quelle kostet bei jedem Start Kontext.',
    source: 'Scanner loadMode',
  },
  bedingt: {
    when: 'bedingt',
    control: 'Scanner-Wahrheit: diese Quelle lädt nur bei passendem Frontmatter/Trigger.',
    source: 'Scanner loadMode',
  },
  'bei-bedarf': {
    when: 'bei Bedarf',
    control: 'Scanner-Wahrheit: der Inhalt lädt erst bei Nutzung.',
    source: 'Scanner loadMode',
  },
  unbekannt: {
    when: 'bedingt',
    control: 'Scanner-Wahrheit: Ladeverhalten noch nicht sicher klassifiziert.',
    source: 'Scanner loadMode',
  },
}

export function hintFromLoadMode(mode: LoadMode): LoadHint {
  return MODE_HINTS[mode]
}
