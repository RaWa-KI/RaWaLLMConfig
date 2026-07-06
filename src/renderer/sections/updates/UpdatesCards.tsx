import { useState } from 'react'
import type { SourceState, WatcherChangelog, WatcherSource, WatcherTier } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { ExplainPanel } from '../../components/ExplainPanel'
import { LineNumberedPre } from '../../components/LineNumberedText'
import { useExplain } from '../config/use-explain'

// Praesentations-Karten der Updates-Sektion (aus UpdatesSection.tsx extrahiert,
// HR27: Hauptdatei lag >300 Z). Reine Anzeige aus watcher.data — keine Mutation.
// ChangelogItem traegt zusaetzlich das kind-getriebene ExplainPanel (kind
// 'changelog' -> explain.ts FAMILY/KIND.changelog).

const UPD_STATE: Record<SourceState, { label: string; cls: string }> = {
  current: { label: 'aktuell', cls: 'active' },
  recent: { label: 'kürzlich aktualisiert', cls: 'dup' },
  update: { label: 'Update verfügbar', cls: 'conflict' },
  gated: { label: 'Freigabe nötig', cls: 'stale' },
  flag: { label: 'markiert', cls: 'ghost' }
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
        <span className="vchip" title="installiert">{s.current}</span>
        {s.latest && s.latest !== s.current && (
          <span className="vchip vchip-latest" title="Zielversion">{s.latest}</span>
        )}
        <span className={'tierbadge t' + s.tier}>Stufe {s.tier}</span>
        <span className={'pill ' + st.cls}>
          {st.cls !== 'ghost' && <span className="pd" />}
          {st.label}
        </span>
        <span className="chev">{Icon.chev}</span>
      </div>
    </div>
  )
}

// ─── Changelog-Eintrag mit on-demand Volltext + Explain ──────────────────────

export function ChangelogItem({ c }: { c: WatcherChangelog }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fulltext, setFulltext] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  // kind 'changelog' (kind-getrieben) -> explain.ts KIND.changelog.
  const explain = useExplain('changelog', c.tool)

  async function loadFulltext() {
    if (!c.path) return
    if (open) { setOpen(false); return }
    if (fulltext !== null) { setOpen(true); return }
    setLoading(true)
    try {
      const api = window.electronAPI
      if (!api?.watcherReadFull) {
        setErr('Bridge nicht verfügbar.')
        setLoading(false)
        return
      }
      const res = await api.watcherReadFull({ path: c.path, family: 'watcher' })
      if (res.error || !res.data) {
        setErr('Volltext konnte nicht geladen werden.')
      } else {
        setFulltext(res.data.content)
        setOpen(true)
      }
    } catch {
      setErr('Fehler beim Laden.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cl-item" key={c.tool + c.version}>
      <span className="cl-dot" />
      <div className="cl-body">
        <div className="cl-head-row">
          <span className="cl-tool">{c.tool}</span>
          <span className="cl-ver">{c.version}</span>
          <span className="cl-date">{c.date}</span>
          {c.path && (
            <button
              type="button"
              className="cl-full-btn pill ghost"
              onClick={() => { void loadFulltext() }}
              disabled={loading}
            >
              {loading ? '…' : open ? 'schließen' : 'Volltext'}
            </button>
          )}
        </div>
        <div className="cl-sum">{c.summary}</div>
        {err && <div className="cl-err">{err}</div>}
        {open && fulltext !== null && <LineNumberedPre className="cl-fulltext" content={fulltext} />}
        {open && (
          <ExplainPanel
            title={explain.title}
            text={explain.text}
            loading={explain.loading}
            error={explain.error}
          />
        )}
      </div>
    </div>
  )
}
