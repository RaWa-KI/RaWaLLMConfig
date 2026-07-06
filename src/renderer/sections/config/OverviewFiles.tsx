import { useEffect, useState } from 'react'
import type { IpcResult, ListDirData, ListDirFile } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { TRUNCATED } from '@shared/dup-labels'
import { OverviewEditor } from './OverviewEditor'
import './OverviewEditor.css'

// OverviewFiles — Innendatei-Liste eines Uebersichts-Eintrags, der ein ORDNER ist
// (Skill = Verzeichnis). Owner-Reichweite 15:17 (Dup-Standard ueberall): der
// Eintrag klappt zu einer Liste ALLER Innendateien auf (listDir auf den Ordnerpfad,
// read-only — NUR Name/Groesse/secret-Flag, NIE Inhalt). D046/HR29: das Secret-
// Flag ist Metadatum fuer Scanner/Logs, aber kein Owner-UI-Blocker; jede Datei
// kann per Klick im OverviewEditor geoeffnet werden.
// truncated → ehrlicher Teilmengen-Hinweis. KEINE neuen Aktionen je Innendatei
// (DupRowActions bleibt auf Eintrags-Ebene). Eintraege mit Einzeldatei-path
// zeigen weiter direkt den Editor (OverviewEntry waehlt den Pfad-Modus).

interface ListState {
  loading: boolean
  files: ListDirFile[]
  truncated: boolean
  error: string | null
}

const EMPTY: ListState = { loading: true, files: [], truncated: false, error: null }

// listDir liegt als eigene Bridge-Methode am electronAPI (ListDirApi im Preload);
// env.d.ts deklariert ListDirApi bereits am Window-Typ — direkter Zugriff moeglich.
// Ohne Bridge → Fehler-State.
type ListDirBridge = { listDir(req: { dirPath: string }): Promise<IpcResult<ListDirData>> }

function listDirBridge(): ListDirBridge | null {
  if (typeof window === 'undefined') return null
  const api = window.electronAPI as unknown as Partial<ListDirBridge> | undefined
  return api && typeof api.listDir === 'function' ? (api as ListDirBridge) : null
}

async function fetchList(dirPath: string): Promise<ListState> {
  const bridge = listDirBridge()
  if (!bridge) return { loading: false, files: [], truncated: false, error: 'Bridge nicht verfuegbar' }
  const res = await bridge.listDir({ dirPath })
  if (res.error || !res.data) return { loading: false, files: [], truncated: false, error: res.error ?? 'Lesen fehlgeschlagen' }
  return { loading: false, files: res.data.files, truncated: res.data.truncated === true, error: null }
}

export function OverviewFiles({ dirPath }: { dirPath: string }) {
  const [st, setSt] = useState<ListState>(EMPTY)
  useEffect(() => {
    let alive = true
    setSt(EMPTY)
    void fetchList(dirPath).then((s) => {
      if (alive) setSt(s)
    })
    return () => {
      alive = false
    }
  }, [dirPath])

  if (st.loading) return <div className="ove-hint">Dateien werden geladen …</div>
  if (st.error) return <div className="ove-denied">Innendatei-Liste konnte nicht geladen werden.</div>
  if (st.files.length === 0) return <div className="ove-hint">Keine Innendateien gefunden.</div>

  return (
    <div className="ovf-list">
      {st.truncated && (
        <div className="ovf-trunc">
          {Icon.note}
          {TRUNCATED.bulkHinweis}
        </div>
      )}
      {st.files.map((f) => (
        <OverviewFileRow key={f.rel} file={f} dirPath={dirPath} />
      ))}
    </div>
  )
}

// Eine Innendatei-Zeile: Kopf + Toggle; aufgeklappt der OverviewEditor.
function OverviewFileRow({ file, dirPath }: { file: ListDirFile; dirPath: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={'dir-file' + (open ? ' open' : '')}>
      <div className="dir-file-row">
        <button
          type="button"
          className="dir-file-head"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className={'dir-chev' + (open ? ' open' : '')}>{Icon.chev}</span>
          <span className="dir-file-level">Datei</span>
          <span className="dir-rel mono">{file.rel}</span>
        </button>
      </div>
      {open && (
        <div className="ovf-drill">
          <OverviewEditor path={joinDir(dirPath, file.rel)} name={file.name} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}

// listDir liefert nur den relativen Pfad (rel). Der OverviewEditor braucht den
// ABSOLUTEN Dateipfad fuer readFull. Da listDir keinen abs-Pfad mitgibt, baut der
// Renderer den Vollpfad aus Ordnerpfad + rel (kein fs/path-Import im Renderer).
// Trenner folgt dem Ordnerpfad (Windows '\\' bzw. POSIX '/'); der Editor selbst
// loest secret-Gate + readFull auf der Main-Seite auf (Vollpfad fliesst nur durch).
function joinDir(dirPath: string, rel: string): string {
  const base = dirPath.replace(/[\\/]+$/, '')
  const sep = base.includes('\\') ? '\\' : '/'
  return base + sep + rel.replace(/\//g, sep)
}
