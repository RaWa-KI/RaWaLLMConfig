import { useCallback, useEffect, useState } from 'react'
import { useWriteConfig } from '../../state/store-write-config'
import { SICHERUNG, SPEICHERN, WRITE_AUS } from '@shared/dup-labels'
import { fetchFull } from './use-fetch-full'
import { LineNumberedTextarea } from '../../components/LineNumberedText'
import './OverviewEditor.css'

// OverviewEditor — einspaltiger Direkt-Editor EINER Datei in der Skills-Übersicht
// (v4 §view-ov: .diff-cols.one-col + .save-bar). Owner-Reichweite: ALLE
// Übersichten editierbar — auch die Secret-/Settings-Klasse. D046/HR29: lokale
// Owner-Sicht bekommt den rohen Vollinhalt ohne Reveal-/Maskier-Gate. Mutation
// läuft weiter über requestWrite -> Confirm -> backup-first; Scanner, Logs und
// Agentenausgaben bleiben getrennte Sanitizing-Pfade.

interface FullState {
  loading: boolean
  content: string
  error: string | null
  // true, sobald readFull rohen Vollinhalt geliefert hat.
  ready: boolean
}

const EMPTY: FullState = {
  loading: true,
  content: '',
  error: null,
  ready: false
}

export function OverviewEditor({
  path,
  name,
  onDone
}: {
  path: string
  name: string
  onDone(): void
}) {
  const wc = useWriteConfig()
  const [full, setFull] = useState<FullState>(EMPTY)

  // Beim Mount/Pfad-Wechsel: rohen Vollinhalt frisch laden (nie entry.code).
  useEffect(() => {
    let alive = true
    setFull(EMPTY)
    void fetchFull(path, false).then((r) => {
      if (!alive) return
      setFull((s) => ({
        ...s,
        loading: false,
        content: r.content,
        error: r.error,
        ready: r.error === null
      }))
    })
    return () => {
      alive = false
    }
  }, [path])

  const saveBlocked = !full.ready

  // Speichern: Confirm-Flow über store-write (edit auf Vollinhalt).
  // ownerEdit:true = Owner-Override fuer den owner-initiierten Einzeldatei-Edit
  // (auch Secret-/Settings-Klasse). Wird ueber pending -> editEntry bis in den
  // WriteRequest durchgereicht; backup-first + Confirm + Maskierung bleiben aktiv.
  const onSave = useCallback(() => {
    if (saveBlocked) return
    wc.requestWrite({
      action: 'edit',
      path,
      content: full.content,
      label: `Inhalt von ${name} speichern`,
      ownerEdit: true
    })
  }, [wc, path, name, saveBlocked, full.content])

  return (
    <div className="ov-edit">
      <OverviewEditorHead name={name} path={path} />
      <OverviewEditorBody
        full={full}
        onChange={(v) => setFull((s) => ({ ...s, content: v }))}
      />
      {full.ready && (
        <OverviewEditorBar
          busy={wc.busy}
          writeEnabled={wc.writeEnabled}
          writeReason={wc.writeReason}
          onSave={onSave}
          onCancel={onDone}
        />
      )}
    </div>
  )
}

// Kopf: Dateiname + Pfad + „direkt editierbar"-Tag (v4 .diff-col-head).
function OverviewEditorHead({ name, path }: { name: string; path: string }) {
  return (
    <div className="ove-head">
      <div className="ove-title">
        {name}
        <span className="ove-tag">direkt editierbar</span>
      </div>
      <div className="ove-path mono">{path}</div>
    </div>
  )
}

// Editier-Fläche bzw. Ladezustände.
function OverviewEditorBody({
  full,
  onChange
}: {
  full: FullState
  onChange(v: string): void
}) {
  if (full.loading) return <div className="ove-hint">Vollinhalt wird geladen …</div>
  if (full.error === 'owner-only/not-in-scope') {
    return <div className="ove-denied">Nur für Eigentümer / nicht im Bearbeitungsumfang (Secret-Pfad).</div>
  }
  if (full.error) return <div className="ove-denied">Inhalt konnte nicht geladen werden.</div>
  return (
    <LineNumberedTextarea
      className="ove-code mono"
      value={full.content}
      ariaLabel="Inhalt bearbeiten"
      onChange={onChange}
    />
  )
}

// Speichern-Leiste (v4 .save-bar): Sicherungs-Hinweis + Verwerfen + Speichern.
// Speichern hart gesperrt bei Write-OFF oder busy.
function OverviewEditorBar({
  busy,
  writeEnabled,
  writeReason,
  onSave,
  onCancel
}: {
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  onSave(): void
  onCancel(): void
}) {
  const gateTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined
  return (
    <>
      <div className="ove-bar">
        <span className="ove-bar-hint">{SICHERUNG.inlineHinweis}</span>
        <span className="ove-bar-spacer" />
        <button type="button" className="ove-btn ghost" onClick={onCancel} disabled={busy}>
          {SPEICHERN.verwerfen}
        </button>
        <button
          type="button"
          className="ove-btn primary"
          onClick={onSave}
          disabled={busy || !writeEnabled}
          title={gateTitle}
        >
          Änderungen speichern
        </button>
      </div>
    </>
  )
}
