import type { WatcherDaemon } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'

export function UpdatesDaemonCard({
  daemon,
  signalCount,
  tierCount
}: {
  daemon: WatcherDaemon
  signalCount: number
  tierCount: number
}) {
  const isLive = daemon.note.startsWith('Live aus Scope-B')
  return (
    <div className="card daemon-card">
      <div className="dc-orb">{Icon.refresh}</div>
      <div className="dc-body">
        <div className="dc-pills">
          <span className="dc-title">{msg('update.watcher.daemon')}</span>
          <span className="pill active"><span className="pd" />{daemon.status}</span>
          <span className={'pill ' + (isLive ? 'active' : 'ghost')}>
            {isLive ? msg('update.watcher.live') : msg('update.watcher.static')}
          </span>
          <span className="pill ghost">
            {msg('update.watcher.lastResult', { lastResult: daemon.lastResult })}
          </span>
          {daemon.schedule && (
            <span className="pill ghost" title={msg('update.watcher.daemonSchedule')}>
              {daemon.schedule}
            </span>
          )}
        </div>
        <div className="dc-note">{daemon.note}</div>
      </div>
      <div className="daemon-stats">
        <StatItem value={daemon.sources} label={msg('update.watcher.sources')} />
        <StatItem value={signalCount} label={msg('update.watcher.signals')} />
        <StatItem value={tierCount} label={msg('update.watcher.tiers')} />
      </div>
    </div>
  )
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div className="ds-item">
      <div className="ds-n">{value}</div>
      <div className="ds-l">{label}</div>
    </div>
  )
}
