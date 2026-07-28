import { useCallback } from 'react'
import type { ConfigEntry } from '@shared/contract'
import { useWriteConfig } from '../../state/store-write-config'
import { msgText } from '../../lib/messages'
import { useStore } from '../../state/store'
import type { DisplayMode } from '../../state/types'
import { LineNumberedTextarea } from '../../components/LineNumberedText'
import { useEditorFullContent } from './use-editor-full-content'
import {
  isReadFullGuardError,
  readFullErrText,
  READ_FULL_GUARD_TEXT
} from '../../lib/read-full-error-text'
import './EditForm.css'

// Feld-Editor (Teil C, WP-04). KRITISCH: Der Code-Editor laedt den VOLLEN Datei-
// Inhalt frisch via config:readFull (Teil-A-Read-Kanal mit Secret-Guard) und
// editiert NIE das gekuerzte entry.code. Owner-Override/D046: lokale Owner-Sicht
// bekommt den rohen Vollinhalt ohne Reveal-/Maskier-Gate; Daten-Sicherheit bleibt
// beim Speichern ueber Schreibmodus, Confirm und backup-first.
// WP-5 (B6/B7): Eintraege ohne eigene Datei (fileBacked === false, z.B.
// Inferenz-Endpoints) duerfen KEIN readFull ausloesen — EditForm ist darum eine
// hook-lose Huelle, die den Hook tragenden Editor (EditFormFile) nur im
// dateibasierten Fall mountet.

// Laienverstaendlicher Hinweis (HR28) fuer Eintraege ohne eigene Datei.
const NO_FILE_EDIT_HINT =
  'Dieser Eintrag hat keine eigene Datei — es gibt keinen Dateiinhalt zu ' +
  'bearbeiten. Ändern kannst du ihn in den Einstellungen des jeweiligen Programms.'

export function EditForm({ entry, onDone }: { entry: ConfigEntry; onDone(): void }) {
  // Hook-lose Verzweigung: bei fileBacked === false wird EditFormFile (und
  // damit useEditorFullContent -> config:readFull) GAR NICHT gemountet.
  if (entry.fileBacked === false) {
    return (
      <div className="edit-form">
        <div className="ef-label">Inhalt bearbeiten</div>
        <div className="ef-hint">{NO_FILE_EDIT_HINT}</div>
      </div>
    )
  }
  return <EditFormFile entry={entry} onDone={onDone} />
}

function EditFormFile({ entry, onDone }: { entry: ConfigEntry; onDone(): void }) {
  const wc = useWriteConfig()
  const { ui } = useStore()
  const { full, setFull } = useEditorFullContent(entry.path)
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

  // Sonderfall zuerst: Der Secret-Guard ist eine Schutzentscheidung, kein
  // Ladefehler — er wird VOR dem allgemeinen Fehlermapping ausgegeben.
  const guardDenied = isReadFullGuardError(full.error)
  return (
    <div className="edit-form">
      <div className="ef-label">Inhalt bearbeiten</div>
      {full.loading && <div className="ef-hint">Vollinhalt wird geladen …</div>}
      {!full.loading && guardDenied && <div className="ef-denied">{READ_FULL_GUARD_TEXT}</div>}
      {!full.loading && !guardDenied && full.error && (
        <div className="ef-denied">{readFullErrText(full.error)}</div>
      )}
      {full.ready && (
        <EditFormEditor
          content={full.content}
          busy={wc.busy}
          displayMode={ui.displayMode}
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
  displayMode,
  saveBlocked,
  gateTitle,
  onChange,
  onSave,
  onDone
}: {
  content: string
  busy: boolean
  displayMode: DisplayMode
  saveBlocked: boolean
  gateTitle: string | undefined
  onChange(v: string): void
  onSave(): void
  onDone(): void
}) {
  return (
    <>
      <ModeNote displayMode={displayMode} />
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

function ModeNote({ displayMode }: { displayMode: DisplayMode }) {
  const text = displayMode === 'expert' ? msgText('expertDetails.rawDetails') : msgText('simpleMode.riskHint')
  return <div className={'ef-mode-note ' + displayMode}>{text}</div>
}
