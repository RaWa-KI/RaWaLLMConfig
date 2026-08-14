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
          Keine Konfigurationsordner erkannt — du kannst die App ohne zusätzliche Konfiguration
          starten und später unter Einstellungen → Ordner gezielt Ordner hinzufügen.
        </p>
      </div>
    )
  }
  return (
    <div className="ob-list-wrap">
      <p className="ob-list-hint">Erkannte Konfigurationsordner ({hits.length}):</p>
      <DiscoveryStep hits={hits} selected={picked} onToggle={onToggle} />
    </div>
  )
}
