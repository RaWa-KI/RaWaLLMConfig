import type { AppData, Watcher } from '@shared/contract'
import { watcherHelp } from '@shared/messages/ux-copy'
import { FocusNotice } from '../../components/FocusNotice'
import { msg } from '../../lib/messages'
import { DriftBanner } from '../referenz/DriftBanner'
import { datasetForModel, referenceModels } from '../referenz/reference-datasets'
import {
  driftItems,
  sourceIsStale,
  usedArtifacts,
  versionsFromWatcher
} from '../referenz/ref-logic'
import { TierCard } from './UpdatesCards'
import { ChangelogList } from './UpdatesChangelogList'
import { UpdatesDaemonCard } from './UpdatesDaemonCard'
import { UpdatesSourceList } from './UpdatesSourceList'

export function UpdatesDataView({
  configData,
  filter,
  onFilter,
  watcher
}: {
  configData: AppData | null
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
  const impact = referenceModels(configData)
    .map((model) => {
      const ver = versionsFromWatcher(watcher.sources, model.id)
      const dataset = datasetForModel(configData, model.id, 'environment')
      const used = usedArtifacts(configData?.data[model.id])
      const items = driftItems(dataset, ver, watcher.sources, model.id, used, configData?.data[model.id])
      return {
        id: model.id,
        label: model.name,
        ver,
        stale: sourceIsStale(watcher.sources, model.id),
        items
      }
    })
    .filter((entry) => entry.ver && entry.items.length > 0)

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
      {impact.map((entry) => (
        <section className="watcher-impact" key={entry.id} aria-label={`${entry.label}: Betrifft dich`}>
          <h3>{entry.label}</h3>
          <DriftBanner
            items={entry.items}
            installed={entry.ver?.installed}
            latest={entry.ver?.latest}
            stale={entry.stale}
          />
        </section>
      ))}
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
