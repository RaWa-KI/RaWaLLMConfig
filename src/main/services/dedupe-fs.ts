// dedupe-fs.ts — Pfad-/Datei-Helfer fuer die Dubletten-Erkennung (read-only).
// Aus dedupe.ts ausgelagert (HR27-Split: dedupe.ts bleibt unter 300 Z).
// Reine fs-/Pfad-Operationen, alle in try/catch; KEINE Secret-/Wert-Ausgabe
// (Dateien werden nur gehasht, nie inhaltlich zurueckgegeben).

import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

// Obergrenze fuer Hash-Reads (Security 2026-08-14: unbounded drift hashing).
// hashFile laeuft synchron im Main-Prozess; ohne Cap koennten grosse gleichnamige
// Dateien in zwei Provider-Roots (Drift-Relationen) oder Content-Dedupe-Funde den
// Prozess blockieren (Speicher + Event-Loop). EINE Quelle — dedupe-content-scan
// importiert den Wert (vorher lokale Kopie). Ueberschreitung -> null (graceful,
// wie Lesefehler): die Datei gilt als nicht vergleichbar statt als 'same'.
export const MAX_HASH_BYTES = 10 * 1024 * 1024

/** True, wenn der absolute Pfad ein Verzeichnis ist (graceful bei Fehler). */
export function isDirSafe(abs: string): boolean {
  try {
    return statSync(abs).isDirectory()
  } catch (err) {
    fail('isDirSafe', err)
    return false
  }
}

/** True, wenn der absolute Pfad eine Datei ist (graceful bei Fehler). */
export function isFileSafe(abs: string): boolean {
  try {
    return statSync(abs).isFile()
  } catch (err) {
    fail('isFileSafe', err)
    return false
  }
}

/** Liest Datei und liefert SHA-256-Hex; null wenn nicht lesbar/zu gross (graceful). */
export function hashFile(rawPath: string): string | null {
  try {
    const abs = resolvePath(rawPath)
    if (!abs) return null
    const st = statSync(abs)
    if (!st.isFile() || st.size > MAX_HASH_BYTES) return null
    return createHash('sha256').update(readFileSync(abs)).digest('hex')
  } catch (err) {
    fail('hashFile', err)
    return null
  }
}

/** Loest ~/-Praefix und relative Pfade zu absolutem Dateipfad auf. */
export function resolvePath(p: string): string | null {
  if (!p) return null
  if (p.includes('›') || p.includes('>')) return null // virtuelle Anzeige-Pfade
  let resolved = p
  if (resolved.startsWith('~')) resolved = join(homedir(), resolved.slice(1).replace(/^[\\/]/, ''))
  return isAbsolute(resolved) ? resolved : null
}

/** Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe. */
function fail(where: string, err: unknown): void {
  console.error(`[scan:dedupe-fs:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
