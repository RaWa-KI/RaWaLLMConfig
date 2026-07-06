import type { CredentialMeta } from '@shared/contract-write'

// Vollinhalt via Bridge holen (kein fs im Renderer). Der Owner-Editor ruft ohne
// Reveal und bekommt main-seitig rohen Inhalt; reveal bleibt nur fuer kompatible
// defensive Read-Pfade erhalten.
// Geteilte Utility fuer EditForm + OverviewEditor (dup-fetchfull).

export interface FetchedFull {
  content: string
  error: string | null
  masked: boolean
  cred: CredentialMeta | null
}

export async function fetchFull(path: string, reveal: boolean): Promise<FetchedFull> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return { content: '', error: 'Bridge nicht verfügbar', masked: false, cred: null }
  }
  const res = await window.electronAPI.readFull(reveal ? { path, reveal: true } : { path })
  if (res.error || !res.data) {
    return { content: '', error: res.error ?? 'Lesen fehlgeschlagen', masked: false, cred: null }
  }
  return {
    content: res.data.content,
    error: null,
    masked: res.data.masked === true,
    cred: res.data.credential ?? null
  }
}
