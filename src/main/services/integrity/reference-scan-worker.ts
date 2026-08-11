// reference-scan-worker.ts — utilityProcess-Entry für den Batch-Referenz-Scan.
// Läuft als eigener Kindprozess, damit der Electron-Main-Prozess (und damit die
// UI) während eines grossen Scans nicht blockiert. Kein Electron-Import nötig:
// process.parentPort ist eine reine Prozess-API des utilityProcess.
// Gibt NIE Datei-Inhalte, Pfad-Snippets oder Secret-Werte in Fehlertexten zurück.
import { scanReferencesBatch, type ScanOptions, type ScanPair } from './reference-scan'

export interface ScanJobRequest {
  id: number
  pairs: ScanPair[]
  opts: ScanOptions
}

interface ParentPortLike {
  on(channel: 'message', listener: (event: { data: ScanJobRequest }) => void): void
  postMessage(message: unknown): void
}

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPortLike }).parentPort

parentPort?.on('message', (event) => {
  const job = event?.data
  if (!job || typeof job.id !== 'number') return
  void scanReferencesBatch(job.pairs ?? [], job.opts ?? {})
    .then((results) => {
      parentPort?.postMessage({ id: job.id, results })
    })
    .catch(() => {
      // Bewusst generisch: kein Pfad, kein Inhalt, kein Secret im Fehlertext.
      parentPort?.postMessage({ id: job.id, error: 'reference-scan-worker: Scan fehlgeschlagen' })
    })
})
