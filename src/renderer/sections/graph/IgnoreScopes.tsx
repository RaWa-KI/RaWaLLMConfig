import { useCallback, useEffect, useState } from 'react'
import type { GraphIgnores, IgnoreScope, IgnoreScopeState } from '@shared/contract-graph'
import { Icon } from '../../components/Icon'

// Ignore-Scopes-Editor (WP-B4): drei GETRENNTE, einzeln editierbare Ignore-
// Quellen je WS (obsidian userIgnoreFilters / graphify .graphignore / .gitignore).
// Laedt beim Mount/wsRoot-Wechsel via graphReadIgnores, schreibt je Scope einzeln
// (KEIN Zwangs-Sync) via graphWriteIgnore. Schreibmodus-AUS/Fehler werden sauber
// angezeigt, NIE Crash. exists:false => leeres Feld + Neuanlage-Hinweis. wsRoot ist
// rein funktional fuer IPC und wird NIE im UI angezeigt. Ignore-Listen sind keine
// Secrets — nur Glob-Muster.

// Anzeige-Meta je Scope (Label + sprechender Dateiname). Reihenfolge = Anzeige.
interface ScopeMeta {
  scope: IgnoreScope
  label: string
  file: string
  note: string
}

const SCOPES: ScopeMeta[] = [
  {
    scope: 'obsidian',
    label: 'Obsidian',
    file: '.obsidian/app.json · userIgnoreFilters',
    note: 'Eine Glob je Zeile — steuert, was Obsidian aus dem Vault ausblendet.'
  },
  {
    scope: 'graphify',
    label: 'graphify',
    file: '.graphignore',
    note: 'Eine Glob je Zeile — steuert, was der graphify-Ingest auslässt.'
  },
  {
    scope: 'gitignore',
    label: 'Git',
    file: '.gitignore',
    note: 'Reiner Datei-Text — Standard-Git-Ignore-Regeln.'
  }
]

// Feedback-Status je Scope nach einem Speicher-Versuch.
type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'ok'; snapshot: string }
  | { phase: 'error'; msg: string }

// Editierbarer Stand eines Scopes im UI: aktueller Text + ob er bekannt geladen ist.
interface ScopeEdit {
  text: string
  exists: boolean
}

type EditMap = Record<IgnoreScope, ScopeEdit>
type SaveMap = Record<IgnoreScope, SaveState>

const EMPTY_EDIT: ScopeEdit = { text: '', exists: false }
const IDLE: SaveState = { phase: 'idle' }

function toEdit(s: IgnoreScopeState): ScopeEdit {
  return { text: s.content, exists: s.exists }
}

function initialEdits(): EditMap {
  return { obsidian: EMPTY_EDIT, graphify: EMPTY_EDIT, gitignore: EMPTY_EDIT }
}

function initialSaves(): SaveMap {
  return { obsidian: IDLE, graphify: IDLE, gitignore: IDLE }
}

// Ladezustand der gesamten Sektion.
type LoadPhase = 'loading' | 'error' | 'ready'

export function IgnoreScopes({ wsRoot }: { wsRoot: string }) {
  const [phase, setPhase] = useState<LoadPhase>('loading')
  const [loadErr, setLoadErr] = useState<string>('')
  const [edits, setEdits] = useState<EditMap>(initialEdits)
  const [saves, setSaves] = useState<SaveMap>(initialSaves)

  // Laden beim Mount + bei jedem wsRoot-Wechsel. Bridge-Abwesenheit => Fehler,
  // kein Crash. Stale-Schutz via alive-Flag (wsRoot kann waehrend Load wechseln).
  useEffect(() => {
    let alive = true
    setPhase('loading')
    setSaves(initialSaves())
    void (async () => {
      const api = typeof window !== 'undefined' ? window.electronAPI : undefined
      if (!api?.graphReadIgnores) {
        if (alive) {
          setLoadErr('Bridge nicht verfügbar')
          setPhase('error')
        }
        return
      }
      try {
        const res = await api.graphReadIgnores(wsRoot)
        if (!alive) return
        if (res.error || !res.data) {
          setLoadErr(res.error ?? 'Ignore-Scopes konnten nicht gelesen werden')
          setPhase('error')
          return
        }
        applyLoaded(res.data, setEdits, setPhase)
      } catch (err) {
        if (alive) {
          setLoadErr(err instanceof Error ? err.message : 'Unbekannter Fehler')
          setPhase('error')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [wsRoot])

  const onChange = useCallback((scope: IgnoreScope, text: string) => {
    setEdits((prev) => ({ ...prev, [scope]: { ...prev[scope], text } }))
    setSaves((prev) => ({ ...prev, [scope]: IDLE }))
  }, [])

  const onSave = useCallback(
    async (scope: IgnoreScope) => {
      await saveScope(wsRoot, scope, edits[scope].text, setSaves, setEdits)
    },
    [wsRoot, edits]
  )

  if (phase === 'loading') {
    return (
      <div className="gblock">
        <ScopesHead />
        <div className="gph-empty">Lade Ignore-Scopes …</div>
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div className="gblock">
        <ScopesHead />
        <div className="gph-empty ign-loaderr">Fehler beim Laden: {loadErr}</div>
      </div>
    )
  }

  return (
    <div className="gblock">
      <ScopesHead />
      <div className="ign-scopes">
        {SCOPES.map((meta) => (
          <ScopeCard
            key={meta.scope}
            meta={meta}
            edit={edits[meta.scope]}
            save={saves[meta.scope]}
            onChange={onChange}
            onSave={onSave}
          />
        ))}
      </div>
      <div className="gnote">
        {Icon.snap}
        <span>Kein Zwangs-Sync — jeder Scope wird einzeln gespeichert (backup-first).</span>
      </div>
    </div>
  )
}

function ScopesHead() {
  return (
    <div className="gblock-head">
      {Icon.gear}
      <h3>Ignore-Scopes</h3>
      <span>drei getrennt · einzeln editierbar</span>
    </div>
  )
}

// Ein Scope-Feld: Kopf (Label + Datei), Hinweis, Textarea, Speichern + Feedback.
function ScopeCard(props: {
  meta: ScopeMeta
  edit: ScopeEdit
  save: SaveState
  onChange: (scope: IgnoreScope, text: string) => void
  onSave: (scope: IgnoreScope) => void
}) {
  const { meta, edit, save, onChange, onSave } = props
  const saving = save.phase === 'saving'
  return (
    <div className="ign-scope">
      <div className="ign-head">
        <span className="ign-label">{meta.label}</span>
        <code className="ign-file">{meta.file}</code>
      </div>
      <div className="ign-note">{meta.note}</div>
      {!edit.exists && (
        <div className="ign-new">Datei existiert noch nicht — wird beim Speichern neu angelegt.</div>
      )}
      <textarea
        className="ign-area"
        spellCheck={false}
        value={edit.text}
        disabled={saving}
        onChange={(e) => onChange(meta.scope, e.target.value)}
        aria-label={meta.label + ' Ignore-Regeln'}
      />
      <div className="ign-bar">
        <button type="button" className="ign-save" disabled={saving} onClick={() => onSave(meta.scope)}>
          {Icon.save}
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        <SaveFeedback save={save} />
      </div>
    </div>
  )
}

function SaveFeedback({ save }: { save: SaveState }) {
  if (save.phase === 'ok') {
    return (
      <span className="ign-ok">
        {Icon.check}
        gespeichert{save.snapshot ? ' · Backup angelegt' : ' · neu angelegt'}
      </span>
    )
  }
  if (save.phase === 'error') {
    return (
      <span className="ign-err">
        {Icon.warn}
        {save.msg}
      </span>
    )
  }
  return null
}

// Wendet das geladene Read-Resultat auf die Edit-Map an und setzt ready.
function applyLoaded(
  data: GraphIgnores,
  setEdits: (m: EditMap) => void,
  setPhase: (p: LoadPhase) => void
) {
  setEdits({
    obsidian: toEdit(data.obsidian),
    graphify: toEdit(data.graphify),
    gitignore: toEdit(data.gitignore)
  })
  setPhase('ready')
}

// Speichert genau einen Scope. Bridge-Abwesenheit/Fehler/WRITE_DISABLED werden als
// Fehlertext gesetzt (kein Crash). Erfolg => exists:true + ok-Feedback.
async function saveScope(
  wsRoot: string,
  scope: IgnoreScope,
  content: string,
  setSaves: (fn: (prev: SaveMap) => SaveMap) => void,
  setEdits: (fn: (prev: EditMap) => EditMap) => void
) {
  setSaves((prev) => ({ ...prev, [scope]: { phase: 'saving' } }))
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  if (!api?.graphWriteIgnore) {
    setSaves((prev) => ({ ...prev, [scope]: { phase: 'error', msg: 'Bridge nicht verfügbar' } }))
    return
  }
  try {
    const res = await api.graphWriteIgnore({ wsRoot, scope, content })
    if (res.error || !res.data) {
      setSaves((prev) => ({
        ...prev,
        [scope]: { phase: 'error', msg: res.error ?? 'Speichern fehlgeschlagen' }
      }))
      return
    }
    setEdits((prev) => ({ ...prev, [scope]: { ...prev[scope], exists: true } }))
    setSaves((prev) => ({ ...prev, [scope]: { phase: 'ok', snapshot: res.data!.snapshotPath } }))
  } catch (err) {
    setSaves((prev) => ({
      ...prev,
      [scope]: { phase: 'error', msg: err instanceof Error ? err.message : 'Unbekannter Fehler' }
    }))
  }
}
