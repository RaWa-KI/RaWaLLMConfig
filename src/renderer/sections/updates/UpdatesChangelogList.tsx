import type { WatcherChangelog } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { ChangelogItem } from './UpdatesChangelogItem'

export function ChangelogList({ changelogs }: { changelogs: WatcherChangelog[] }) {
  return (
    <>
      <div className="group-head upd-changelog-head">
        <h3>{msg('update.watcher.changelogTitle')}</h3>
        <span className="gcount">{msg('update.watcher.localStored')}</span>
      </div>
      <div className="card flat">
        {changelogs.length === 0
          ? <EmptyChangelogs />
          : changelogs.map((c) => <ChangelogItem key={c.tool + c.version} c={c} />)}
      </div>
    </>
  )
}

function EmptyChangelogs() {
  return (
    <div className="empty upd-inline-empty">
      {Icon.book}
      <p>{msg('update.watcher.emptyChangelog')}</p>
    </div>
  )
}
