// store-write-config-bridge.ts — bridge-gekapselte Hilfen fuer den Write-Slice.
// Aus store-write-config.tsx ausgelagert (HR27: Hauptdatei bleibt <300 Z). Reine
// Funktionen ohne React-State: jeder Aufruf ist bridge-guarded und liefert bei
// fehlender Bridge ein sanitisiertes Fehler-Result (kein throw). KEIN fs/path im
// Renderer; Mutation laeuft AUSSCHLIESSLICH ueber window.electronAPI. Secrets nie sichtbar.
import type { WriteRequest, WriteResult } from '@shared/contract-write'

// Write-Modus-Status (Spiegelung des Main-Prozess-Gate).
export interface WriteStatus {
  enabled: boolean
  sandbox: boolean
  reason: string | null
  registrarFailures: string[]
}

// Bridge-Aufruf gekapselt: ohne Bridge ein sanitisiertes Fehler-Result (kein throw).
// Reicht den vollstaendigen WriteRequest unveraendert durch — inkl. optionalem
// ownerEdit (Owner-Override, nur edit/add). Das Flag wird hier NICHT gedroppt.
export async function callApply(req: WriteRequest): Promise<WriteResult> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return { data: null, error: 'Bridge nicht verfuegbar' }
  }
  return window.electronAPI.writeApply(req)
}

// Write-Status vom Main-Prozess abfragen (bridge-guarded).
export async function fetchWriteStatus(): Promise<WriteStatus> {
  if (typeof window === 'undefined' || !window.electronAPI?.writeStatus) {
    return { enabled: false, sandbox: false, reason: 'Bridge nicht verfuegbar', registrarFailures: [] }
  }
  const res = await window.electronAPI.writeStatus()
  if (res.error || !res.data) {
    return {
      enabled: false,
      sandbox: false,
      reason: res.error ?? 'Status unbekannt',
      registrarFailures: []
    }
  }
  return res.data
}

// Write-Modus aktivieren (bridge-guarded).
export async function callSetEnabled(enabled: boolean): Promise<WriteStatus> {
  if (typeof window === 'undefined' || !window.electronAPI?.writeSetEnabled) {
    return { enabled: false, sandbox: false, reason: 'Bridge nicht verfuegbar', registrarFailures: [] }
  }
  const res = await window.electronAPI.writeSetEnabled({ enabled })
  if (res.error || !res.data) {
    return {
      enabled: false,
      sandbox: false,
      reason: res.error ?? 'Aktivierung fehlgeschlagen',
      registrarFailures: []
    }
  }
  return res.data
}
