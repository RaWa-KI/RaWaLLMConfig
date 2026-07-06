// guarded.ts — Generische try/catch-Wrapper fuer den Write-Layer (Main).
// Exportiert 'guarded' (sync) und 'guardedAsync' (async). Logik 1:1 aus den
// kanonischen Vorlagen: guarded aus ipc-write.ts ~Z.40, guardedAsync aus
// ipc-write-prefs.ts ~Z.48. Niemals rohe Error-Objekte oder Secrets ausgeben.
import type { IpcResult } from '@shared/contract'

/**
 * Sync try/catch-Wrapper -> sanitisiertes IpcResult (nie roher Error).
 * Vorlage: ipc-write.ts ~Z.40.
 */
export function guarded<T>(label: string, fn: () => IpcResult<T>): IpcResult<T> {
  try {
    return fn()
  } catch (err) {
    console.error('[guarded]', `${label}: ${err instanceof Error ? err.message : 'fail'}`)
    return { data: null, error: 'Schreiben fehlgeschlagen' }
  }
}

/**
 * Async try/catch-Wrapper -> sanitisiertes IpcResult (nie roher Error).
 * Vorlage: ipc-write-prefs.ts ~Z.48.
 */
export async function guardedAsync<T>(
  label: string,
  fn: () => Promise<IpcResult<T>>
): Promise<IpcResult<T>> {
  try {
    return await fn()
  } catch (err) {
    console.error('[guarded]', `${label}: ${err instanceof Error ? err.message : 'fail'}`)
    return { data: null, error: 'Vorgang fehlgeschlagen' }
  }
}
