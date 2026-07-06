// ipc-compare.ts — Read-only IPC-Handler für den Vergleichs-Aggregator.
// Genau EIN ipcMain.handle für 'compare:multi'; kein Write-Gate nötig (read-only).
// Self-registering via register-write.ts (safeRegister('compare', ...)).
// Kein fs/Write, kein roher Pfad/Stack/Secret im Error-Rückgabewert.
import { ipcMain } from 'electron'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type { CompareCandidate, MultiCompareResult } from '@shared/contract-compare'
import { compareMulti } from './services/compare-multi'

// Eingabe-Validierung: Array von Objekten mit Pflichtfeld `path: string`.
function isValidCandidates(raw: unknown): raw is CompareCandidate[] {
  if (!Array.isArray(raw) || raw.length === 0) return false
  return raw.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).path === 'string'
  )
}

// Handler-Logik (rein, kein ipcMain-Coupling).
function handleCompareMulti(candidates: CompareCandidate[]): IpcResult<MultiCompareResult> {
  try {
    return { data: compareMulti(candidates), error: null }
  } catch {
    return { data: null, error: 'Vergleich fehlgeschlagen' }
  }
}

// Self-registering (aufgerufen von register-write.ts -> safeRegister('compare', ...)).
export function registerCompareMulti(): void {
  ipcMain.handle(IPC_WRITE.compareMulti, (_e, candidates: unknown): IpcResult<MultiCompareResult> => {
    if (!isValidCandidates(candidates)) {
      return { data: null, error: 'invalid-request' }
    }
    return handleCompareMulti(candidates)
  })
}
