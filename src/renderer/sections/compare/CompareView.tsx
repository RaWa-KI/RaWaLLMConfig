import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category } from '@shared/contract'
import type { CompareCandidate, MultiCompareResult } from '@shared/contract-compare'
import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { useStore } from '../../state/store'
import type { ComparePreset } from '../../state/types'
import { CompareToolbar } from './CompareToolbar'
import { CompareSummary } from './CompareSummary'
import { CompareVirtualRows } from './CompareVirtualRows'
import { alignColumns } from './compare-logic'
import { SameFileComparePanel } from './SameFileComparePanel'
import { buildSameFileGroups, type SameFileGroup } from './same-file-candidates'
import './CompareView.css'

// CompareView — Container der N-Spalten-Side-by-side-Vergleichsansicht (WP-5).
// Rendert oben die Auswahl-Leiste (CompareToolbar), ruft bei „Vergleichen" den
// read-only IPC-Aggregator (compareMulti, bereits maskiert) und zeigt N alignte
// Spalten ueber CompareVirtualRows. Optik bewusst wie die Duplikate (Reuse diff-shared).
// Zusammenfassung/Marker-Feinschliff/Lade-Hinweise kommen in WP-6 — hier sind
// klar benannte Slots (CompareSummary, je Spaltenkopf ein Lade-Badge) vorbereitet.

interface CompareState {
  result: MultiCompareResult | null
  loading: boolean
  error: string | null
  candidates: CompareCandidate[]
}

const INITIAL: CompareState = { result: null, loading: false, error: null, candidates: [] }
type SummaryMode = 'default' | 'coverage'
type CompareMode = 'list' | 'same-file'

export function CompareView({ cat }: { cat: Category }) {
  const { config, ui } = useStore()
  const [compareMode, setCompareMode] = useState<CompareMode>('list')
  const { st, preset, summaryMode, handleCompare } = useCompareState(ui.comparePreset)
  const sameFileGroups = useMemo(() => buildSameFileGroups(config.data), [config.data])
  const handleSameFileCompare = useCallback((group: SameFileGroup) => {
    void handleCompare(group.candidates)
  }, [handleCompare])
  return (
    <div className="cmp-view">
      {preset && <ComparePresetPanel preset={preset} onStart={() => handleCompare(preset.candidates)} />}
      <CompareModeSwitch mode={compareMode} onModeChange={setCompareMode} />
      {compareMode === 'list' ? (
        <CompareToolbar cat={cat} onCompare={handleCompare} />
      ) : (
        <SameFileComparePanel groups={sameFileGroups} onCompare={handleSameFileCompare} />
      )}
      <CompareBody st={st} summaryMode={summaryMode} />
    </div>
  )
}

function CompareModeSwitch({
  mode,
  onModeChange,
}: {
  mode: CompareMode
  onModeChange(mode: CompareMode): void
}) {
  return (
    <div className="cmp-mode-switch" role="tablist" aria-label="Vergleichsart">
      <button type="button" className={mode === 'list' ? 'on' : ''} onClick={() => onModeChange('list')}>
        {msg('compare.mode.list')}
      </button>
      <button type="button" className={mode === 'same-file' ? 'on' : ''} onClick={() => onModeChange('same-file')}>
        {msg('compare.mode.sameFile')}
      </button>
    </div>
  )
}

// Vergleichs-Lauf (aus useCompareState extrahiert, HR27-Funktionslimit).
function useCompareRunner() {
  const [st, setSt] = useState<CompareState>(INITIAL)

  // Vergleich starten: Bridge-Guard, dann compareMulti. Fehler werden sanitisiert
  // angezeigt (kein Stacktrace/Secret). Result -> alignte N-Spalten-Anzeige.
  const handleCompare = useCallback(async (candidates: CompareCandidate[]) => {
    setSt({ result: null, loading: true, error: null, candidates })
    const api = window.electronAPI
    if (!api?.compareMulti) {
      setSt({ ...INITIAL, candidates, error: 'Vergleich ist nur in der App verfügbar.' })
      return
    }
    try {
      const r = await api.compareMulti(candidates)
      if (r.error || !r.data) {
        setSt({ ...INITIAL, candidates, error: r.error ?? 'Vergleich fehlgeschlagen.' })
      } else {
        setSt({ result: r.data, loading: false, error: null, candidates })
      }
    } catch {
      setSt({ ...INITIAL, candidates, error: 'Vergleich fehlgeschlagen.' })
    }
  }, [])

  return { st, setSt, handleCompare }
}

// Preset-Autostart (aus useCompareState extrahiert, HR27-Funktionslimit):
// sobald ein neues Preset ankommt, laeuft der Vergleich ohne Zutun. Gilt fuer
// BEIDE Herkunftsarten (Spiegelung + Konflikt).
function usePresetAutostart(
  preset: ComparePreset | null,
  setSt: (st: CompareState) => void,
  handleCompare: (candidates: CompareCandidate[]) => Promise<void>,
) {
  const [startedPresetKey, setStartedPresetKey] = useState<string | null>(null)
  const presetKey = useMemo(() => preset ? presetIdentity(preset) : null, [preset])
  useEffect(() => {
    if (!preset || !presetKey || startedPresetKey === presetKey) return
    setStartedPresetKey(presetKey)
    if (preset.candidates.length < 2) {
      setSt({ ...INITIAL, candidates: preset.candidates })
      return
    }
    void handleCompare(preset.candidates)
  }, [handleCompare, preset, presetKey, setSt, startedPresetKey])
}

function useCompareState(comparePreset: ComparePreset | null) {
  const { st, setSt, handleCompare } = useCompareRunner()
  // Jede Preset-Herkunft wird uebernommen ('coverage' aus der Spiegelung,
  // 'conflict' aus dem Konflikt-Kasten des Drawers). Die frueher harte
  // 'coverage'-Pruefung hat Fremd-Presets stumm verworfen.
  const preset = comparePreset
  usePresetAutostart(preset, setSt, handleCompare)
  const summaryMode: SummaryMode =
    preset && sameCandidates(st.candidates, preset.candidates) ? 'coverage' : 'default'
  return { st, preset, summaryMode, handleCompare }
}

// Anzeige-Zustaende: kein/zu wenig Result, loading, error, Result -> N Spalten.
function CompareBody({ st, summaryMode }: { st: CompareState; summaryMode: SummaryMode }) {
  if (st.loading) {
    return <div className="cmp-loading">{Icon.refresh} Vergleiche Dateien …</div>
  }
  if (st.error) {
    return <div className="cmp-error">{Icon.warn} {st.error}</div>
  }
  if (!st.result) {
    return (
      <div className="cmp-placeholder">
        {Icon.diff} Wähle ≥2 Dateien zum Vergleichen.
      </div>
    )
  }
  return <CompareGrid result={st.result} summaryMode={summaryMode} />
}

// N-Spalten-Raster (horizontal scrollbar, weiche Grenze — KEINE harte Obergrenze
// bei vielen Spalten, Q5). truncated -> sichtbarer Hinweis (kein stiller Schnitt).
// Die Spaltenzahl wird ueber die CSS-Variable --cmp-cols per Callback-Ref am DOM
// gesetzt (kein inline-style-Objekt, HR27/Lint: Styles bleiben in CompareView.css).
function CompareGrid({ result, summaryMode }: { result: MultiCompareResult; summaryMode: SummaryMode }) {
  const aligned = useMemo(() => alignColumns(result), [result])
  const n = aligned.length
  const gridRef = useCallback(
    (el: HTMLDivElement | null) => el?.style.setProperty('--cmp-cols', String(n)),
    [n]
  )
  return (
    <div className="cmp-grid-wrap">
      {/* WP-6-Slot: <CompareSummary> (dup-/Inkonsistenz-Auswertung + Empfehlung). */}
      <div className="cmp-summary-slot" data-wp6-slot="summary">
        <CompareSummary result={result} mode={summaryMode} />
      </div>
      {result.truncated && (
        <div className="cmp-truncated">
          {Icon.note} Sehr viele Zeilen — Anzeige gekappt (Sicherheitsgrenze).
        </div>
      )}
      <div className="cmp-grid" ref={gridRef}>
        <CompareVirtualRows columns={aligned} />
      </div>
    </div>
  )
}

// Identitaet eines Presets: aendert sich der Schluessel, startet der Vergleich neu.
function presetIdentity(preset: ComparePreset): string {
  return [
    preset.source,
    preset.createdFrom.createdAt,
    preset.row.cat,
    preset.row.name,
    preset.candidates.map((c) => c.id + ':' + c.path).join('|'),
  ].join('::')
}

function sameCandidates(a: CompareCandidate[], b: CompareCandidate[]): boolean {
  if (a.length !== b.length || a.length === 0) return false
  return a.every((cand, i) => cand.id === b[i]?.id && cand.path === b[i]?.path)
}

// Kopftexte je Herkunft: der Vergleich ist derselbe, nur die Erklaerung wechselt.
const PRESET_TEXT = {
  coverage: {
    area: 'Spiegelungs-Prüfung',
    title: 'Aus Spiegelung übernommen',
    tooFew: 'Für den direkten Vergleich sind mindestens zwei Dateipfade nötig.',
  },
  conflict: {
    area: 'Konflikt-Prüfung',
    title: 'Aus dem Konflikt übernommen',
    tooFew: 'Zu diesem Konflikt gibt es nur eine Datei — es gibt nichts zu vergleichen. Der Grund steht oben.',
  },
} as const

function ComparePresetPanel({
  preset,
  onStart,
}: {
  preset: ComparePreset
  onStart(): void
}) {
  const canCompare = preset.candidates.length >= 2
  const text = PRESET_TEXT[preset.source]
  return (
    <section className="cmp-preset" aria-label={text.area}>
      <div className="cmp-preset-head">
        <div>
          <strong>{text.title}</strong>
          <span>{preset.row.cat} · {preset.row.name}</span>
        </div>
        <button type="button" className="cmp-preset-go" disabled={!canCompare} onClick={onStart}>
          {Icon.diff} Prüfen ({preset.candidates.length})
        </button>
      </div>
      <div className="cmp-preset-cells">
        {preset.row.cells.map((cell) => (
          <ComparePresetCell key={cell.id} cell={cell} />
        ))}
      </div>
      {!canCompare && <div className="cmp-preset-note">{Icon.note} {text.tooFew}</div>}
    </section>
  )
}

function ComparePresetCell({ cell }: { cell: ComparePreset['row']['cells'][number] }) {
  const notes = cell.notes?.length ? cell.notes : cell.note ? [cell.note] : []
  return (
    <div className="cmp-preset-cell">
      <span className="cmp-preset-label">{cell.label ?? cell.id}</span>
      <span className="cmp-preset-state">{cell.state ?? 'unbekannt'}</span>
      {cell.path ? <span className="cmp-preset-path mono">{cell.path}</span> : null}
      {notes.map((note) => (
        <span className="cmp-preset-missing" key={note}>{note}</span>
      ))}
    </div>
  )
}
