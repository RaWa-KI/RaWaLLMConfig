import type { ReactElement } from 'react'
import type { DiscoveryHit } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'
import { DiscoveryStep } from './DiscoveryStep'

interface Props {
  hits: DiscoveryHit[]
  picked: Set<string>
  onToggle: (root: string) => void
}

export function SourceChoiceStep({ hits, picked, onToggle }: Props): ReactElement {
  if (hits.length === 0) {
    return (
      <div className="ob-state">
        <span className="ob-state-ic" aria-hidden>{Icon.folder}</span>
        <p>
          Keine Standard-Ordner gefunden — du kannst die App leer starten und
          später Ordner hinzufügen.
        </p>
      </div>
    )
  }
  return (
    <div className="ob-list-wrap">
      <p className="ob-list-hint">Gefundene Ordner ({hits.length}):</p>
      <DiscoveryStep hits={hits} selected={picked} onToggle={onToggle} />
    </div>
  )
}
