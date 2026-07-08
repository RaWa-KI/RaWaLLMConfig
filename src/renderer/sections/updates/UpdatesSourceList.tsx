import type { WatcherSource } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { SourceRow } from './UpdatesCards'

export function UpdatesSourceList({
  kinds = [],
  filter = 'all',
  sources,
  history = false,
  onFilter
}: {
  kinds?: string[]
  filter?: string
  sources: WatcherSource[]
  history?: boolean
  onFilter?: (value: string) => void
}) {
  if (history && sources.length === 0) return null
  return (
    <>
      <ListHead
        count={sources.length}
        filter={filter}
        history={history}
        kinds={kinds}
        onFilter={onFilter}
      />
      <div className="rows">
        {sources.length === 0
          ? <EmptySources />
          : sources.map((s) => <SourceRow key={(history ? 'hist-' : '') + s.name} s={s} />)}
      </div>
    </>
  )
}

function ListHead({ count, filter, history, kinds, onFilter }: {
  count: number
  filter: string
  history: boolean
  kinds: string[]
  onFilter?: (value: string) => void
}) {
  return (
    <div className={'group-head ' + (history ? 'upd-history-head' : 'upd-sources-head')}>
      <h3>{history ? msg('update.watcher.historyTitle') : msg('update.watcher.sourcesTitle')}</h3>
      {history && <span className="gcount">{msg('update.watcher.entryCount', { count: String(count) })}</span>}
      {!history && <FilterRow kinds={kinds} filter={filter} onFilter={onFilter} />}
    </div>
  )
}

function FilterRow({
  kinds,
  filter,
  onFilter
}: {
  kinds: string[]
  filter: string
  onFilter?: (value: string) => void
}) {
  return (
    <div className="upd-filter-row">
      {kinds.map((k) => (
        <button
          key={k}
          type="button"
          className={'pill ' + (filter === k ? 'active' : 'ghost')}
          onClick={() => onFilter?.(k)}
        >
          {k === 'all' ? msg('update.watcher.all') : k}
        </button>
      ))}
    </div>
  )
}

function EmptySources() {
  return (
    <div className="empty upd-inline-empty">
      {Icon.refresh}
      <p>{msg('update.watcher.emptySources')}</p>
    </div>
  )
}
