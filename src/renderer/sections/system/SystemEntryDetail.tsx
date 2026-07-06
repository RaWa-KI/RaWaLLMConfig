import { useState } from 'react'
import type { SystemEntry } from '@shared/contract'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { ExplainPanel } from '../../components/ExplainPanel'
import { useExplain } from '../config/use-explain'

// Detail-/Edit-Body eines System-Eintrags (aufgeklappt).
// Felder aus entry.fields werden angezeigt; bei writeEnabled sind sie editierbar.
// Felder in entry.manualFields erhalten ein "manuell"-Badge.
// Schreibzugriff nur ueber window.electronAPI.systemWrite (Bridge-only, kein FS).
// ExplainPanel: kind-getriebener "Was macht das?"-Text (kind 'sys' -> explain.ts).

interface Props {
  areaId: string
  entry: SystemEntry
}

export function SystemEntryDetail({ areaId, entry }: Props) {
  const { actions } = useStore()
  const wc = useWriteConfig()
  const fields = Object.entries(entry.fields ?? {})
  const manual = entry.manualFields ?? []
  // kind 'sys' (kind-getrieben) -> explain.ts FAMILY.sys + KIND.sys.
  const explain = useExplain('sys', entry.name)

  if (fields.length === 0) {
    return (
      <div className="entry-detail empty-detail">
        <span className="detail-none">Keine Feld-Details verfügbar.</span>
        <ExplainPanel
          title={explain.title}
          text={explain.text}
          loading={explain.loading}
          error={explain.error}
        />
      </div>
    )
  }

  return (
    <div className="entry-detail">
      {fields.map(([key, val]) => (
        <FieldRow
          key={key}
          areaId={areaId}
          entryId={entry.id ?? entry.name}
          fieldKey={key}
          value={val}
          isManual={manual.includes(key)}
          writeEnabled={wc.writeEnabled}
          onSaved={() => actions.reload()}
        />
      ))}
      {!wc.writeEnabled && (
        <div className="detail-readonly-hint">
          Schreibmodus inaktiv — Felder nur lesbar.
        </div>
      )}
      <ExplainPanel
        title={explain.title}
        text={explain.text}
        loading={explain.loading}
        error={explain.error}
      />
    </div>
  )
}

interface FieldRowProps {
  areaId: string
  entryId: string
  fieldKey: string
  value: string
  isManual: boolean
  writeEnabled: boolean
  onSaved(): void
}

function FieldRow({ areaId, entryId, fieldKey, value, isManual, writeEnabled, onSaved }: FieldRowProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSave() {
    if (!window.electronAPI?.systemWrite) return
    setBusy(true)
    setErr(null)
    try {
      const res = await window.electronAPI.systemWrite({
        patches: [{ areaId, entryId, field: fieldKey, value: draft }]
      })
      if (res.error) {
        setErr(res.error)
      } else {
        setEditing(false)
        onSaved()
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field-row">
      <div className="field-key">
        <span className="field-key-txt">{fieldKey}</span>
        {isManual && <span className="badge-manual">manuell</span>}
      </div>
      <div className="field-val">
        {editing ? (
          <div className="field-edit-row">
            <input
              className="field-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button type="button" className="btn-save" onClick={() => void handleSave()} disabled={busy}>
              {busy ? '…' : 'Speichern'}
            </button>
            <button type="button" className="btn-cancel" onClick={() => { setEditing(false); setDraft(value) }} disabled={busy}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="field-val-row">
            <span className="field-val-txt">{value}</span>
            {/* Edit-Control IMMER sichtbar: bei Write-OFF (Env-Opt-out) disabled
                + Grund-Tooltip, bei ON aktiv (Default-AN, Owner-Entscheid). */}
            <button
              type="button"
              className="btn-edit-field"
              onClick={() => writeEnabled && setEditing(true)}
              disabled={!writeEnabled}
              title={writeEnabled ? 'Feld bearbeiten' : 'Bearbeiten ist ausgeschaltet (RAWALLM_WRITE_ENABLED=0)'}
            >
              Bearbeiten
            </button>
          </div>
        )}
        {err && <div className="field-err">{err}</div>}
      </div>
    </div>
  )
}
