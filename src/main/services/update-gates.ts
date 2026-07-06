/**
 * update-gates.ts — Transport-unabhaengige Installer-Validierungs-Gates.
 * SRP: nur Datei-Pruefungen (kein Electron, kein Netz, kein State).
 * Importiert von update-source-local.ts (HR27-Split, da update-source-local.ts sonst >300 Z).
 */

import { existsSync, statSync, createReadStream, renameSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'

/**
 * Prueft die ersten zwei Bytes auf MZ-Signatur (Windows-PE-Header).
 * Gibt false zurueck wenn die Datei fehlt, zu kurz oder kein 'MZ' ist.
 */
export function checkMzHeader(filePath: string): boolean {
  if (!existsSync(filePath)) return false
  const buf = Buffer.alloc(2)
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const read = readSync(fd, buf, 0, 2, 0)
    if (read < 2) return false
    return buf[0] === 0x4d && buf[1] === 0x5a // 'MZ'
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try { closeSync(fd) } catch { /* ignorieren */ }
    }
  }
}

/**
 * Prueft ob die staged Datei exakt `expected` Bytes gross ist (strict !==).
 */
export function checkExactSize(filePath: string, expected: number): boolean {
  try {
    const s = statSync(filePath)
    return s.isFile() && s.size === expected
  } catch {
    return false
  }
}

/**
 * Berechnet SHA-256-Hash der Datei als lowercase hex-String. Streamed.
 */
export async function sha256Hex(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', (err) => reject(err))
  })
}

/**
 * Verschiebt eine fehlgeschlagene Teil-Copy HR7-konform in `_failed/`-Subordner.
 * Kein silent unlink — Audit-Spur bleibt erhalten.
 */
export function moveToFailed(srcPath: string): void {
  try {
    const failedDir = join(dirname(srcPath), '_failed')
    mkdirSync(failedDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const dest = join(failedDir, `${ts}_${basename(srcPath)}`)
    if (existsSync(srcPath)) renameSync(srcPath, dest)
  } catch {
    // Fehler beim HR7-Move ignorieren — original Fehler hat Vorrang
  }
}
