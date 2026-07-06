// file-read-once.ts — Scan-Fundament: Snapshot-Primitive fuer die Scanner.
// Liefert Text + Metadaten einer Datei mit GENAU 1 stat + max. 1 Read und
// zentralem Size-Cap (eine Quelle, vormals MAX_INDEX_BYTES in content-index.ts).
// Der Cap gilt NUR fuer Scan-Preview/Index — der readFull-Drilldown liest
// weiterhin ungecappt; Owner-Grundprinzip „alles sehen" bleibt unangetastet.
// Read-only; wirft nie. Secret-Pfade (isSecretPathForRead) werden NIE roh
// gelesen — text bleibt dort undefined (Maskierung uebernimmt content-index).
import fs from 'node:fs'
import { isSecretPathForRead } from '../services/secret-guard'

// Zentraler Size-Cap fuer Scan-Reads (gleicher Wert wie das fruehere
// MAX_INDEX_BYTES): Dateien groesser als dieses Limit werden im Scan nicht
// gelesen (kein Voll-Read auf Riesen) — readFull bleibt davon unberuehrt.
export const MAX_SCAN_BYTES = 256 * 1024

// Snapshot einer Datei: Text (nur wenn lesbar/erlaubt/<= Cap) + Metadaten.
// Formate EXAKT wie die bestehenden Helfer (UI-fields haengen daran):
// mtimeIso wie mtimeSafe (toISOString().slice(0,10)), sizeKb wie sizeKbSafe.
export interface FileSnapshot {
  text?: string
  size: number
  mtimeIso: string
  sizeKb: string
}

/**
 * Liest eine Datei GENAU EINMAL fuer den Scan: 1 statSync + max. 1 readFileSync.
 *
 * text wird NUR gesetzt wenn size > 0, size <= MAX_SCAN_BYTES und der Pfad
 * KEINE Secret-WERT-Klasse ist (isSecretPathForRead); sonst undefined —
 * Metadaten (size/mtimeIso/sizeKb) bleiben trotzdem gesetzt.
 * Read-only, wirft nie.
 *
 * @param absPath absoluter Dateipfad.
 * @returns       FileSnapshot; null wenn stat fehlschlaegt (Datei fehlt o.ae.).
 */
export function readFileOnce(absPath: string): FileSnapshot | null {
  let st: fs.Stats
  try {
    st = fs.statSync(absPath)
  } catch {
    return null
  }
  const size = st.size
  // Format-Paritaet zu mtimeSafe/sizeKbSafe (scan-helpers.ts) — NICHT aendern.
  const mtimeIso = st.mtime.toISOString().slice(0, 10)
  const sizeKb = (size / 1024).toFixed(1)
  let text: string | undefined
  if (size > 0 && size <= MAX_SCAN_BYTES && !isSecretPathForRead(absPath)) {
    try {
      text = fs.readFileSync(absPath, 'utf8')
    } catch {
      text = undefined
    }
  }
  return { text, size, mtimeIso, sizeKb }
}
