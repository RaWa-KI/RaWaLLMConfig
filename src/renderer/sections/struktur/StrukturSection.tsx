import { useEffect, useState } from 'react'
import type { StrukturFinding, StrukturFindingStatus, StrukturScanResultData } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { useWriteConfig } from '../../state/store-write-config'
import './StrukturSection.css'

// Struktur-/Anomalie-Scan (Owner-Punkt 11): zeigt fehlplatzierte/doppelte
// Standard-Config-Ordner. Read-only. Tab-Einhaengung in App.tsx macht D (nicht H).

type ScanState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; msg: string }
  | { phase: 'done'; result: StrukturScanResultData }

const STATUS_LABEL: Record<StrukturFindingStatus, string> = {
  ok: 'OK',
  warn: 'Warnung',
  misplaced: 'Fehlplatziert',
  duplicate: 'Duplikat'
}

const STATUS_CSS: Record<StrukturFindingStatus, string> = {
  ok: 'ok',
  warn: 'warn',
  misplaced: 'misplaced',
  duplicate: 'dup'
}

export function StrukturSection() {
  const [state, setState] = useState<ScanState>({ phase: 'idle' })

  async function runScan(): Promise<void> {
    setState({ phase: 'loading' })
    try {
      if (typeof window === 'undefined' || !window.electronAPI?.strukturScan) {
        setState({ phase: 'error', msg: 'Bridge nicht verfuegbar' })
        return
      }
      const res = await window.electronAPI.strukturScan()
      if (res.error || !res.data) {
        setState({ phase: 'error', msg: res.error ?? 'Scan fehlgeschlagen' })
      } else {
        setState({ phase: 'done', result: res.data })
      }
    } catch (err) {
      setState({ phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' })
    }
  }

  useEffect(() => {
    void runScan()
  }, [])

  return (
    <main className="main struktur-main">
      <div className="view-head">
        <div className="view-title">
          <h2>Struktur-Scan</h2>
          <p>Fehlplatzierte oder doppelte Standard-Config-Ordner in 4 Roots (Tiefe max 5).</p>
        </div>
        <button className="btn-ghost" onClick={() => void runScan()} disabled={state.phase === 'loading'}>
          {Icon.refresh}
          {state.phase === 'loading' ? 'Scannt …' : 'Neu scannen'}
        </button>
      </div>
      <StrukturBody state={state} onRefresh={runScan} />
    </main>
  )
}

function StrukturBody({ state, onRefresh }: { state: ScanState; onRefresh(): Promise<void> }) {
  if (state.phase === 'idle') return null

  if (state.phase === 'loading') {
    return (
      <div className="empty">
        {Icon.refresh}
        <p>Scanne Config-Ordner …</p>
      </div>
    )
  }

  if (state.phase === 'error') {
    return (
      <div className="empty struktur-error">
        {Icon.warn}
        <p>Fehler: {state.msg}</p>
      </div>
    )
  }

  const { findings, scannedRoots, truncated } = state.result
  const byStatus = (s: StrukturFindingStatus) => findings.filter((f) => f.status === s)
  const misplaced = byStatus('misplaced')
  const duplicate = byStatus('duplicate')
  const warn = byStatus('warn')
  const ok = byStatus('ok')

  return (
    <div className="struktur-body">
      <StrukturSummary
        total={findings.length}
        counts={{ misplaced: misplaced.length, duplicate: duplicate.length, warn: warn.length, ok: ok.length }}
        roots={scannedRoots.length}
        truncated={truncated}
      />
      <FindingGroup title="Fehlplatziert" headCss="misplaced-head" findings={misplaced} keyPrefix="m" onRefresh={onRefresh} />
      <FindingGroup title="Duplikate" headCss="dup-head" findings={duplicate} keyPrefix="d" onRefresh={onRefresh} />
      <FindingGroup title="Warnungen" headCss="warn-head" findings={warn} keyPrefix="w" onRefresh={onRefresh} />
      <FindingGroup title="Erwartet / OK" headCss="ok-head" findings={ok} keyPrefix="o" onRefresh={onRefresh} />
      {findings.length === 0 && (
        <div className="empty">
          {Icon.check}
          <p>Keine Config-Ordner gefunden.</p>
        </div>
      )}
    </div>
  )
}

// Eine nach Status getrennte Befundgruppe; rendert nichts wenn leer.
function FindingGroup(props: {
  title: string
  headCss: string
  findings: StrukturFinding[]
  keyPrefix: string
  onRefresh(): Promise<void>
}) {
  const { title, headCss, findings, keyPrefix, onRefresh } = props
  if (findings.length === 0) return null
  return (
    <section className="struktur-section">
      <h3 className={`struktur-group-head ${headCss}`}>
        {title} ({findings.length})
      </h3>
      <div className="rows">
        {findings.map((f, i) => (
          <FindingRow key={`${keyPrefix}-${i}`} finding={f} onRefresh={onRefresh} />
        ))}
      </div>
    </section>
  )
}

function StrukturSummary(props: {
  total: number
  counts: { misplaced: number; duplicate: number; warn: number; ok: number }
  roots: number
  truncated: boolean
}) {
  const { total, counts, roots, truncated } = props
  const anomalies = counts.misplaced + counts.duplicate + counts.warn
  return (
    <div className="struktur-summary">
      <span>{roots} Roots gescannt</span>
      <span className="sum-sep">·</span>
      <span>{total} Config-Ordner</span>
      <span className="sum-sep">·</span>
      <span className={anomalies > 0 ? 'sum-warn' : 'sum-ok'}>
        {anomalies > 0 ? `${anomalies} Anomalie${anomalies > 1 ? 'n' : ''}` : 'Keine Anomalien'}
      </span>
      {anomalies > 0 && (
        <span className="sum-sep struktur-sum-detail">
          ({counts.misplaced} fehlplatziert · {counts.duplicate} Duplikate · {counts.warn} Warnungen)
        </span>
      )}
      {truncated && (
        <>
          <span className="sum-sep">·</span>
          <span className="sum-warn">Scan abgebrochen (Tiefenlimit)</span>
        </>
      )}
    </div>
  )
}

function FindingRow({ finding, onRefresh }: { finding: StrukturFinding; onRefresh(): Promise<void> }) {
  const css = STATUS_CSS[finding.status] ?? 'ok'
  const label = STATUS_LABEL[finding.status] ?? finding.status
  const actionable = finding.status === 'misplaced' || finding.status === 'duplicate'
  return (
    <div className="struktur-row-wrap">
      <div className={`row struktur-row struktur-row--${css}`}>
        <div className="row-ic">{finding.status === 'ok' ? Icon.check : Icon.warn}</div>
        <div className="row-main">
          <div className="row-name">
            <code className="struktur-path">{finding.path}</code>
          </div>
          <div className="row-desc">
            <span className="struktur-root">{finding.root}</span>
            {finding.note && <span className="struktur-note"> · {finding.note}</span>}
          </div>
        </div>
        <div className="row-meta">
          {actionable && <StrukturArchiveAction path={finding.path} onRefresh={onRefresh} />}
          <span className={`pill struktur-pill--${css}`}>
            <span className="pd" />
            {label}
          </span>
        </div>
      </div>
    </div>
  )
}

function StrukturArchiveAction({ path, onRefresh }: { path: string; onRefresh(): Promise<void> }) {
  const { archiveDirEntry, busy, writeEnabled, writeReason } = useWriteConfig()
  const [confirm, setConfirm] = useState(false)
  const title = !writeEnabled ? (writeReason ?? 'Schreibmodus nicht aktiv') : undefined

  async function onArchive() {
    const ok = await archiveDirEntry(path)
    if (ok) {
      setConfirm(false)
      await onRefresh()
    }
  }

  if (!confirm) {
    return (
      <button type="button" className="struktur-action" disabled={!writeEnabled || busy} title={title} onClick={() => setConfirm(true)}>
        {Icon.archive}Archivieren
      </button>
    )
  }
  return (
    <div className="struktur-confirm">
      <span>Diesen Ordner backup-first archivieren?</span>
      <button type="button" className="struktur-mini" disabled={busy} onClick={() => setConfirm(false)}>
        {Icon.x}Nein
      </button>
      <button type="button" className="struktur-mini adopt" disabled={busy || !writeEnabled} onClick={() => void onArchive()}>
        {Icon.check}{busy ? 'Arbeitet …' : 'Ja'}
      </button>
    </div>
  )
}
