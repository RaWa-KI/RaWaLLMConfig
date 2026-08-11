// reference-scan-host.ts — Host-Seite der Scan-Auslagerung (M4).
// Im Electron-Main-Prozess läuft der Batch-Referenz-Scan in einem
// utilityProcess-Kindprozess, damit die UI während grosser Scans bedienbar
// bleibt (Owner-Befund: Duplikat-Merge wirkte minutenlang eingefroren).
// Ausserhalb von Electron (Service-Tests laufen in plain Node) und bei jedem
// Worker-Problem läuft derselbe Scan direkt in-process — identisches Ergebnis,
// nur ohne Prozessgrenze. Kein stiller Hänger, kein Zombie-Prozess.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { UtilityProcess } from 'electron'
import {
  scanReferencesBatch,
  type ReferenceScanResult,
  type ScanOptions,
  type ScanPair
} from './reference-scan'
import type { ScanJobRequest } from './reference-scan-worker'

// Build-Artefakt aus electron.vite.config.ts (main-Input 'reference-scan-worker').
const WORKER_FILE = 'reference-scan-worker.js'
const WORKER_TIMEOUT_MS = 120_000

let nextJobId = 1

interface ScanJobResponse {
  id: number
  results?: ReferenceScanResult[]
  error?: string
}

/** Nur im Electron-Main-Prozess ist utilityProcess verfügbar (nach app-ready). */
function isElectronMain(): boolean {
  const proc = process as NodeJS.Process & { type?: string }
  return Boolean(process.versions.electron) && proc.type === 'browser'
}

/**
 * Lazy/konditional laden: in plain Node (Service-Tests) darf 'electron' nie
 * aufgeloest werden — deshalb createRequire statt statischem Import.
 */
function forkWorker(): UtilityProcess {
  const requireElectron = createRequire(__filename)
  const { utilityProcess } = requireElectron('electron') as typeof import('electron')
  return utilityProcess.fork(join(__dirname, WORKER_FILE), [], {
    serviceName: 'rawallmconfig-reference-scan'
  })
}

/** Job posten, auf Antwort warten, Kindprozess in jedem Ausgang beenden. */
function awaitWorkerResult(
  child: UtilityProcess,
  request: ScanJobRequest
): Promise<ReferenceScanResult[]> {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (err: Error | null, results: ReferenceScanResult[]): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      try {
        child.kill()
      } catch {
        // Kindprozess bereits beendet — nichts zu tun.
      }
      if (err) rejectPromise(err)
      else resolvePromise(results)
    }
    timer = setTimeout(
      () => finish(new Error('reference-scan-worker: Zeitlimit erreicht'), []),
      WORKER_TIMEOUT_MS
    )
    child.on('message', (message: ScanJobResponse) => {
      if (!message || message.id !== request.id) return
      if (message.error) finish(new Error(message.error), [])
      else finish(null, message.results ?? [])
    })
    child.on('exit', () => finish(new Error('reference-scan-worker: vorzeitig beendet'), []))
    child.once('spawn', () => child.postMessage(request))
  })
}

/**
 * Batch-Referenz-Scan, wenn möglich ausserhalb des Main-Prozesses.
 * Fällt bei fehlendem Electron, Fork-Fehler, vorzeitigem Exit oder Zeitlimit
 * GENAU EINMAL auf den In-Process-Scan zurück (mit Konsolen-Warnung).
 */
export async function scanReferencesBatchOffThread(
  pairs: ScanPair[],
  opts: ScanOptions
): Promise<ReferenceScanResult[]> {
  if (pairs.length === 0) return []
  if (!isElectronMain()) return scanReferencesBatch(pairs, opts)

  try {
    const request: ScanJobRequest = { id: nextJobId++, pairs, opts }
    return await awaitWorkerResult(forkWorker(), request)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unbekannt'
    console.warn(`[reference-scan] Worker nicht nutzbar (${reason}) — Scan läuft in-process.`)
    return scanReferencesBatch(pairs, opts)
  }
}
