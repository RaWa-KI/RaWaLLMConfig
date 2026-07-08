import type { ReactElement } from 'react'
import type { ModelDiscoveryHit } from '@shared/contract-sources'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'

export function ModelDiscoveryStep(props: {
  hits: ModelDiscoveryHit[]
  onPickModelFolder: () => void
  busy: boolean
}): ReactElement {
  const { hits, onPickModelFolder, busy } = props
  return (
    <section className="ob-section" aria-labelledby="ob-model-title">
      <h2 id="ob-model-title" className="ob-section-title">{msg('onboarding.modelDiscovery.title')}</h2>
      {hits.length === 0 ? <ModelEmpty onPickModelFolder={onPickModelFolder} busy={busy} /> : <ModelList hits={hits} />}
    </section>
  )
}

function ModelEmpty(props: { onPickModelFolder: () => void; busy: boolean }): ReactElement {
  return (
    <div className="ob-state ob-state--compact">
      <span className="ob-state-ic" aria-hidden>{Icon.list}</span>
      <p>{msg('onboarding.modelDiscovery.empty')}</p>
      <button type="button" className="btn ghost sm" onClick={props.onPickModelFolder} disabled={props.busy}>
        {Icon.folder}
        {msg('onboarding.modelDiscovery.chooseFolder')}
      </button>
    </div>
  )
}

function ModelList({ hits }: { hits: ModelDiscoveryHit[] }): ReactElement {
  return (
    <ul className="ob-hits" role="list">
      {hits.map((hit) => (
        <li key={hit.id} className="ob-hit ob-hit--on">
          <div className="ob-model-row">
            <span className="ob-model-icon" aria-hidden>{hit.kind === 'endpoint' ? Icon.api : Icon.list}</span>
            <span className="ob-hit-text">
              <span className="ob-hit-label">{hit.label}</span>
              <span className="ob-hit-path">{hit.path}</span>
              {hit.kind === 'endpoint' && <span className="ob-endpoint-line">{hit.detail}</span>}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
