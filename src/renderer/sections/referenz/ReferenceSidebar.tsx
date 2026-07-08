import type { LlmDef } from '@shared/contract'
import type { RefArtifact, RefDataset } from '@shared/contract-referenz'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import type { ReferenceMode } from './reference-datasets'

interface ReferenceSidebarProps {
  dataset: RefDataset
  arts: RefArtifact[]
  models: LlmDef[]
  llm: string
  artId: string
  counts: Record<string, number>
  query: string
  mode: ReferenceMode
  onMode(mode: ReferenceMode): void
  onLlm(id: string): void
  onArt(id: string): void
}

export function RefSidebar(props: ReferenceSidebarProps) {
  const { dataset, arts, models, llm, artId, counts, query, mode, onMode, onLlm, onArt } = props
  const ql = query.trim()
  return (
    <aside className="sidebar">
      <div className="ref-mode-switch" aria-label="Referenzbereich wählen">
        <button
          type="button"
          className={'ref-mode-btn' + (mode === 'commands' ? ' on' : '')}
          onClick={() => onMode('commands')}
        >
          {msg('help.nav.title')}
        </button>
        <button
          type="button"
          className={'ref-mode-btn' + (mode === 'environment' ? ' on' : '')}
          onClick={() => onMode('environment')}
        >
          {msg('tasks.expert.title')}
        </button>
      </div>
      <div className="ref-model-picker">
        <label htmlFor="ref-model-select">{mode === 'commands' ? 'Katalog für' : msg('tasks.expert.title')}</label>
        <select id="ref-model-select" value={llm} onChange={(event) => onLlm(event.target.value)}>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}{model.sub ? ` · ${model.sub}` : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="side-label">{mode === 'commands' ? msg('help.nav.title') : 'Artefakte'}</div>
      {arts.map((art) => (
        <button
          key={art.id}
          type="button"
          className={
            'nav-item' +
            (artId === art.id ? ' on' : '') +
            (ql && counts[art.id] === 0 ? ' faded' : '')
          }
          onClick={() => onArt(art.id)}
        >
          <span className="ni-ic">{art.icon ? Icon[art.icon] : Icon.box}</span>
          <span className="ni-txt">{art.label}</span>
          {ql && counts[art.id] > 0 && <span className="ni-flag ni-flag-hit" />}
          <span className="ni-count">{counts[art.id]}</span>
        </button>
      ))}
      {arts.length === 0 && <div className="empty-state">Noch keine Einträge.</div>}
      <div className="nav-sep" />
      <div className="ref-side-note">
        {mode === 'commands'
          ? `Befehle nach Arbeitsumgebung. Stand ${dataset.updated ?? 'live'} · ${dataset.source ?? 'Scan'}`
          : `Gefundene und kuratierte Einträge. Stand ${dataset.updated ?? 'live'} · ${dataset.source ?? 'Scan'}`}
      </div>
    </aside>
  )
}
