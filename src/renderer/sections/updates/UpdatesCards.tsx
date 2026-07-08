import type { SourceState, WatcherSource, WatcherTier } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'

// Praesentations-Karten der Updates-Sektion (aus UpdatesSection.tsx extrahiert,
// HR27: Hauptdatei lag >300 Z). Reine Anzeige aus watcher.data — keine Mutation.

const UPD_STATE: Record<SourceState, { label: string; cls: string }> = {
  current: { label: msg('update.watcher.state.current'), cls: 'active' },
  recent: { label: msg('update.watcher.state.recent'), cls: 'dup' },
  update: { label: msg('update.watcher.state.update'), cls: 'conflict' },
  gated: { label: msg('update.watcher.state.gated'), cls: 'stale' },
  flag: { label: msg('update.watcher.state.flag'), cls: 'ghost' }
}

function kindIcon(kind: string) {
  const name =
    kind === 'CLI' ? 'term'
    : kind === 'Extension' ? 'edit'
    : kind === 'Models' ? 'sparkle'
    : kind === 'Packages' ? 'box'
    : 'cpu'
  return Icon[name] ?? Icon.cpu
}

export function TierCard({ tr }: { tr: WatcherTier }) {
  return (
    <div className="card tier-card">
      <div className="tc-head">
        <span className={'pill ' + tr.cls}>
          <span className="pd" />
          {tr.label}
        </span>
        <span className="tc-mode">{tr.mode}</span>
      </div>
      <p>{tr.desc}</p>
    </div>
  )
}

export function SourceRow({ s }: { s: WatcherSource }) {
  const st = UPD_STATE[s.state] ?? UPD_STATE.current
  return (
    <div className="row">
      <div className="row-ic">{kindIcon(s.kind)}</div>
      <div className="row-main">
        <div className="row-name">
          <span className="mono">{s.name}</span>
        </div>
        <div className="row-desc">{s.note ?? s.kind}</div>
      </div>
      <div className="row-meta">
        <span className="vchip" title={msg('update.watcher.installed')}>{s.current}</span>
        {s.latest && s.latest !== s.current && (
          <span className="vchip vchip-latest" title={msg('update.watcher.targetVersion')}>{s.latest}</span>
        )}
        <span className={'tierbadge t' + s.tier}>{msg('update.watcher.tierBadge', { tier: String(s.tier) })}</span>
        <span className={'pill ' + st.cls}>
          {st.cls !== 'ghost' && <span className="pd" />}
          {st.label}
        </span>
        <span className="chev">{Icon.chev}</span>
      </div>
    </div>
  )
}
