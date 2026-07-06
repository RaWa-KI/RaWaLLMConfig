// DiscoveryStep.tsx — präsentationale Trefferliste fuer den Erststart-Dialog
// (OSS Teil C, WP-C4). Zeigt die gefundenen Standard-Ordner mit Haken; KEINE
// eigene Bridge-/IPC-Logik (alles laeuft ueber die Eltern-Komponente). Jeder
// Treffer ist per Default angehakt (Owner-Entscheid); der Nutzer kann einzelne
// abwaehlen. Label = sprechender Name, darunter der Pfad als Sekundaerzeile.
import type { ReactElement } from 'react'
import type { DiscoveryHit } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'

interface Props {
  hits: DiscoveryHit[]
  selected: Set<string> // angehakte Treffer (Schluessel = hit.root)
  onToggle: (root: string) => void
}

export function DiscoveryStep({ hits, selected, onToggle }: Props): ReactElement {
  return (
    <ul className="ob-hits" role="list">
      {hits.map((hit) => {
        const on = selected.has(hit.root)
        return (
          <li key={hit.root} className={`ob-hit${on ? ' ob-hit--on' : ''}`}>
            <button
              type="button"
              className="ob-hit-btn"
              aria-pressed={on}
              onClick={() => onToggle(hit.root)}
            >
              <span className={`ob-check${on ? ' ob-check--on' : ''}`} aria-hidden>
                {on ? Icon.check : null}
              </span>
              <span className="ob-hit-text">
                <span className="ob-hit-label">{hit.label}</span>
                <span className="ob-hit-path">{hit.root}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
