import type { Watcher } from '@shared/contract'
import { watcherHelp } from '@shared/messages/ux-copy'
import { FocusNotice } from '../../components/FocusNotice'
import { msg } from '../../lib/messages'
import { TierCard } from './UpdatesCards'
import { ChangelogList } from './UpdatesChangelogList'
import { UpdatesDaemonCard } from './UpdatesDaemonCard'
import { UpdatesSourceList } from './UpdatesSourceList'

export function UpdatesDataView({
  filter,
  onFilter,
  watcher
}: {
  filter: string
  onFilter: (value: string) => void
  watcher: Watcher
}) {
  const kinds = ['all', ...Array.from(new Set(watcher.sources.map((s) => s.kind)))]
  const list = filter === 'all'
    ? watcher.sources
    : watcher.sources.filter((s) => s.kind === filter)
  const signals = watcher.sources.filter((s) => s.state !== 'current').length
  const history = watcher.sources.filter((s) => s.state === 'recent' || s.state === 'update')

  return (
    <main className="main upd-full">
      <div className="view-head">
        <div className="view-title">
          <h2>{msg('update.watcher.title')}</h2>
          <p>
            {msg('update.watcher.subtitle', {
              sourceCount: String(watcher.daemon.sources),
              tokens: watcher.daemon.tokens,
              updated: watcher.daemon.updated
            })}
          </p>
        </div>
      </div>
      <p className="watcher-help">{watcherHelp()}</p>
      <FocusNotice section="updates" />
      <UpdatesDaemonCard
        daemon={watcher.daemon}
        signalCount={signals}
        tierCount={watcher.tiers.length}
      />
      <div className="tier-grid">
        {watcher.tiers.map((tr) => <TierCard key={tr.id} tr={tr} />)}
      </div>
      <UpdatesSourceList kinds={kinds} filter={filter} sources={list} onFilter={onFilter} />
      <UpdatesSourceList history sources={history} />
      <ChangelogList changelogs={watcher.changelogs} />
    </main>
  )
}
