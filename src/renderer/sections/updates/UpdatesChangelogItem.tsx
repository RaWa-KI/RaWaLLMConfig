import { useState } from 'react'
import type { WatcherChangelog } from '@shared/contract'
import { ExplainPanel } from '../../components/ExplainPanel'
import { LineNumberedPre } from '../../components/LineNumberedText'
import { msg } from '../../lib/messages'
import { useExplain } from '../config/use-explain'

export function ChangelogItem({ c }: { c: WatcherChangelog }) {
  const state = useChangelogFulltext(c)
  const explain = useExplain('changelog', c.tool)
  return (
    <div className="cl-item" key={c.tool + c.version}>
      <span className="cl-dot" />
      <div className="cl-body">
        <ChangelogHeader c={c} state={state} />
        <div className="cl-sum">{c.summary}</div>
        {state.err && <div className="cl-err">{state.err}</div>}
        {state.open && state.fulltext !== null && (
          <LineNumberedPre className="cl-fulltext" content={state.fulltext} />
        )}
        {state.open && (
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

function ChangelogHeader({ c, state }: {
  c: WatcherChangelog
  state: ReturnType<typeof useChangelogFulltext>
}) {
  return (
    <div className="cl-head-row">
      <span className="cl-tool">{c.tool}</span>
      <span className="cl-ver">{c.version}</span>
      <span className="cl-date">{c.date}</span>
      {c.path && (
        <button
          type="button"
          className="cl-full-btn pill ghost"
          onClick={() => { void state.loadFulltext() }}
          disabled={state.loading}
        >
          {state.loading ? '…' : state.open ? msg('update.watcher.close') : msg('update.watcher.fulltext')}
        </button>
      )}
    </div>
  )
}

function useChangelogFulltext(c: WatcherChangelog) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fulltext, setFulltext] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function loadFulltext() {
    if (!c.path) return
    if (open) { setOpen(false); return }
    if (fulltext !== null) { setOpen(true); return }
    setLoading(true)
    try {
      const api = window.electronAPI
      if (!api?.watcherReadFull) {
        setErr(msg('update.watcher.bridgeUnavailable'))
        setLoading(false)
        return
      }
      const res = await api.watcherReadFull({ path: c.path, family: 'watcher' })
      if (res.error || !res.data) {
        setErr(msg('update.watcher.fulltextUnavailable'))
      } else {
        setFulltext(res.data.content)
        setOpen(true)
      }
    } catch {
      setErr(msg('update.watcher.loadError'))
    } finally {
      setLoading(false)
    }
  }

  return { err, fulltext, loading, loadFulltext, open }
}
