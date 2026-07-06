import { useState } from 'react'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import { TierCard, SourceRow, ChangelogItem } from './UpdatesCards'
import './UpdatesSection.css'

// Updates-Sektion: Toolchain-Watcher read-only (Phase 1).
// Anzeige aus watcher.data — kein Add/Edit/Drawer, keine Mutation.
// Praesentations-Karten (TierCard/SourceRow/ChangelogItem) liegen in
// UpdatesCards.tsx (HR27-Split); ChangelogItem traegt das Explain-Panel.

// ─── Haupt-Sektion ────────────────────────────────────────────────────────────

export function UpdatesSection() {
  const { watcher } = useStore()
  const [filter, setFilter] = useState('all')
  const w = watcher.data

  if (watcher.loading) {
    return (
      <main className="main upd-full">
        <p className="upd-loading">lädt…</p>
      </main>
    )
  }
  if (!w || watcher.error) {
    return (
      <main className="main upd-full">
        <div className="empty-state">
          <div className="empty">{watcher.error ?? 'Keine Watcher-Daten verfügbar.'}</div>
        </div>
      </main>
    )
  }

  const kinds = ['all', ...Array.from(new Set(w.sources.map((s) => s.kind)))]
  const list = filter === 'all' ? w.sources : w.sources.filter((s) => s.kind === filter)
  const signals = w.sources.filter((s) => s.state !== 'current').length
  const history = w.sources.filter((s) => s.state === 'recent' || s.state === 'update')
  // Live-Bindung: watcher-live liefert Scope-B-Daten; note kennzeichnet Quelle sichtbar.
  const isLive = w.daemon.note.startsWith('Live aus Scope-B')

  return (
    <main className="main upd-full">
        <div className="view-head">
          <div className="view-title">
            <h2>Toolchain-Watcher</h2>
            <p>
              Monitoring-Daemon · {w.daemon.sources} Quellen · {w.daemon.tokens} · Stand{' '}
              {w.daemon.updated}
            </p>
          </div>
        </div>

        <div className="card daemon-card">
          <div className="dc-orb">{Icon.refresh}</div>
          <div className="dc-body">
            <div className="dc-pills">
              <span className="dc-title">Daemon</span>
              <span className="pill active">
                <span className="pd" />
                {w.daemon.status}
              </span>
              <span className={'pill ' + (isLive ? 'active' : 'ghost')}>
                {isLive ? 'live' : 'statisch'}
              </span>
              <span className="pill ghost">LastResult {w.daemon.lastResult}</span>
              {w.daemon.schedule && (
                <span className="pill ghost" title="Daemon-Schedule">{w.daemon.schedule}</span>
              )}
            </div>
            <div className="dc-note">{w.daemon.note}</div>
          </div>
          <div className="daemon-stats">
            <div className="ds-item">
              <div className="ds-n">{w.daemon.sources}</div>
              <div className="ds-l">Quellen</div>
            </div>
            <div className="ds-item">
              <div className="ds-n">{signals}</div>
              <div className="ds-l">Signale</div>
            </div>
            <div className="ds-item">
              <div className="ds-n">{w.tiers.length}</div>
              <div className="ds-l">Stufen</div>
            </div>
          </div>
        </div>

        <div className="tier-grid">
          {w.tiers.map((tr) => (
            <TierCard key={tr.id} tr={tr} />
          ))}
        </div>

        <div className="group-head upd-sources-head">
          <h3>Überwachte Quellen</h3>
          <div className="upd-filter-row">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                className={'pill ' + (filter === k ? 'active' : 'ghost')}
                onClick={() => setFilter(k)}
              >
                {k === 'all' ? 'Alle' : k}
              </button>
            ))}
          </div>
        </div>
        <div className="rows">
          {list.length === 0
            ? <div className="empty upd-inline-empty">{Icon.refresh}<p>Keine Watcher-Quellen im aktuellen Snapshot.</p></div>
            : list.map((s) => <SourceRow key={s.name} s={s} />)}
        </div>

        {history.length > 0 && (
          <>
            <div className="group-head upd-history-head">
              <h3>Änderungs-Historie</h3>
              <span className="gcount">{history.length} Einträge</span>
            </div>
            <div className="rows">
              {history.map((s) => (
                <SourceRow key={'hist-' + s.name} s={s} />
              ))}
            </div>
          </>
        )}

        <div className="group-head upd-changelog-head">
          <h3>Changelog-Feed</h3>
          <span className="gcount">lokal abgelegt</span>
        </div>
        <div className="card flat">
          {w.changelogs.length === 0
            ? <div className="empty upd-inline-empty">{Icon.book}<p>Kein lokaler Changelog-Feed gefunden.</p></div>
            : w.changelogs.map((c) => <ChangelogItem key={c.tool + c.version} c={c} />)}
        </div>
    </main>
  )
}
