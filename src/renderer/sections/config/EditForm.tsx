import { useCallback, useEffect, useState } from 'react'
import type { ConfigEntry } from '@shared/contract'
import { useWriteConfig } from '../../state/store-write-config'
import { LineNumberedTextarea } from '../../components/LineNumberedText'
import { fetchFull } from './use-fetch-full'
import './EditForm.css'

// Feld-Editor (Teil C, WP-04). KRITISCH: Der Code-Editor laedt den VOLLEN Datei-
// Inhalt frisch via config:readFull (Teil-A-Read-Kanal mit Secret-Guard) und
// editiert NIE das gekuerzte entry.code. Owner-Override/D046: lokale Owner-Sicht
// bekommt den rohen Vollinhalt ohne Reveal-/Maskier-Gate; Daten-Sicherheit bleibt
// beim Speichern ueber Schreibmodus, Confirm und backup-first.

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

export function EditForm({ entry, onDone }: { entry: ConfigEntry; onDone(): void }) {
  const wc = useWriteConfig()
  const [full, setFull] = useState<FullState>(EMPTY)

  // Beim Mount/Entry-Wechsel: rohen Vollinhalt frisch laden (nie entry.code).
  useEffect(() => {
    let alive = true
    setFull(EMPTY)
    void fetchFull(entry.path, false).then((r) => {
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
  }, [entry.path])

  const saveBlocked = !wc.writeEnabled || !full.ready

  // Speichern: Confirm-Flow ueber store-write (edit auf Vollinhalt).
  // ownerEdit:true = Owner-Override fuer den owner-initiierten Einzeldatei-Edit
  // (auch Secret-/Settings-Klasse); wird ueber pending -> editEntry bis in den
  // WriteRequest durchgereicht. backup-first + Confirm bleiben aktiv.
  const onSave = useCallback(() => {
    if (saveBlocked) return
    wc.requestWrite({
      action: 'edit',
      path: entry.path,
      content: full.content,
      label: `Inhalt von ${entry.name} speichern`,
      ownerEdit: true
    })
  }, [wc, entry.path, entry.name, saveBlocked, full.content])

  const guardDenied = full.error === 'owner-only/not-in-scope'
  return (
    <div className="edit-form">
      <div className="ef-label">Inhalt bearbeiten</div>
      {full.loading && <div className="ef-hint">Vollinhalt wird geladen …</div>}
      {!full.loading && guardDenied && (
        <div className="ef-denied">Nur für Eigentümer / nicht im Bearbeitungsumfang (Secret-Pfad).</div>
      )}
      {!full.loading && !guardDenied && full.error && (
        <div className="ef-denied">Inhalt konnte nicht geladen werden.</div>
      )}
      {full.ready && (
        <EditFormEditor
          content={full.content}
          busy={wc.busy}
          saveBlocked={saveBlocked}
          gateTitle={wc.writeEnabled ? undefined : (wc.writeReason ?? undefined)}
          onChange={(v) => setFull((s) => ({ ...s, content: v }))}
          onSave={onSave}
          onDone={onDone}
        />
      )}
    </div>
  )
}

// Editier-Textarea + Save-Leiste.
function EditFormEditor({
  content,
  busy,
  saveBlocked,
  gateTitle,
  onChange,
  onSave,
  onDone
}: {
  content: string
  busy: boolean
  saveBlocked: boolean
  gateTitle: string | undefined
  onChange(v: string): void
  onSave(): void
  onDone(): void
}) {
  return (
    <>
      <LineNumberedTextarea
        className="ef-code mono"
        ariaLabel="Inhalt bearbeiten"
        value={content}
        onChange={onChange}
      />
      <div className="ef-actions">
        <button type="button" className="ef-btn ghost" onClick={onDone} disabled={busy}>
          Abbrechen
        </button>
        <button type="button" className="ef-btn primary" onClick={onSave} disabled={busy || saveBlocked} title={gateTitle}>
          Speichern …
        </button>
      </div>
    </>
  )
}
