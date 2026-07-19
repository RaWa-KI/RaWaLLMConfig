/**
 * update-gates.ts — Transport-unabhaengige Installer-Validierungs-Gates.
 * SRP: nur Datei-Pruefungen (kein Electron, kein Netz, kein State).
 * Importiert von update-source-local.ts (HR27-Split, da update-source-local.ts sonst >300 Z).
 */

import { existsSync, statSync, createReadStream, renameSync, mkdirSync, openSync, readSync, closeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, basename } from 'node:path'

/**
 * Prueft die ersten Bytes auf die erwartete Magic-Signatur.
 * Gibt false zurueck wenn die Datei fehlt, zu kurz oder abweichend ist.
 */
export function checkMagicHeader(filePath: string, magic: readonly number[]): boolean {
  if (!existsSync(filePath)) return false
  const buf = Buffer.alloc(magic.length)
  let fd: number | null = null
  try {
    fd = openSync(filePath, 'r')
    const read = readSync(fd, buf, 0, magic.length, 0)
    if (read < magic.length) return false
    return magic.every((byte, index) => buf[index] === byte)
  } catch {
    return false
  } finally {
    if (fd !== null) {
      try { closeSync(fd) } catch { /* ignorieren */ }
    }
  }
}

/**
 * Prueft die ersten zwei Bytes auf MZ-Signatur (Windows-PE-Header).
 * Gibt false zurueck wenn die Datei fehlt, zu kurz oder kein 'MZ' ist.
 */
export function checkMzHeader(filePath: string): boolean {
  return checkMagicHeader(filePath, [0x4d, 0x5a])
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
