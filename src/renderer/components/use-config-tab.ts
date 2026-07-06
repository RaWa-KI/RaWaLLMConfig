import { useEffect, useState } from 'react'
import type { ConfigEntry } from '@shared/contract'

// Geladener Vollinhalt-Zustand (Owner-Override: Secret-Klasse wird maskiert
// ANGEZEIGT, nicht geblockt). `masked`/`maskedCount` aus ReadFullResultData.
export interface FullState {
  content: string
  masked: boolean
  maskedCount: number
}

// Mappt die distinkten Backend-Fehler (res.error) auf owner-lesbare Hinweise —
// statt sie zu einer Generikmeldung zu kollabieren.
function readFullErrText(err: string | null): string {
  switch (err) {
    case 'nicht-gefunden':
      return 'Datei nicht gefunden.'
    case 'ordner':
      return 'Pfad verweist auf einen Ordner, nicht auf eine Datei.'
    case 'nicht-lesbar':
      return 'Datei nicht lesbar (Zugriff verweigert).'
    case 'invalid-request':
      return 'Ungültige Anfrage (kein Pfad hinterlegt).'
    default:
      return 'Inhalt nicht anzeigbar.'
  }
}

// Hook: Fetch-/State-Logik für ConfigTab.
// Verwaltet Vollinhalt-Laden, Fehlermeldungen und Loading-Zustand.
export interface UseConfigTabResult {
  full: FullState | null
  errText: string | null
  loading: boolean
  displayContent: string | undefined
  handleShowFull: () => Promise<void>
}

export function useConfigTab(entry: ConfigEntry): UseConfigTabResult {
  const [full, setFull] = useState<FullState | null>(null)
  const [errText, setErrText] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Zustand zurücksetzen, wenn ein anderer Eintrag ausgewählt wird.
  useEffect(() => {
    setFull(null)
    setErrText(null)
    setLoading(false)
  }, [entry.id])

  async function handleShowFull() {
    if (!entry.path || !window.electronAPI?.readFull) {
      setErrText(readFullErrText(entry.path ? null : 'invalid-request'))
      return
    }
    setLoading(true)
    setErrText(null)
    try {
      // ReadFullResult = IpcResult<ReadFullResultData>: Felder sind data + error.
      const res = await window.electronAPI.readFull({ path: entry.path })
      if (res.data) {
        setFull({
          content: res.data.content,
          masked: res.data.masked === true,
          maskedCount: res.data.maskedCount ?? 0
        })
      } else {
        setErrText(readFullErrText(res.error))
      }
    } catch {
      setErrText(readFullErrText(null))
    } finally {
      setLoading(false)
    }
  }

  // Angezeigter Inhalt: Vollinhalt wenn geladen, sonst Kurz-Auszug.
  const displayContent = full?.content ?? entry.code

  return { full, errText, loading, displayContent, handleShowFull }
}
