// update-installer.ts — Staged Installer verifizieren + NSIS spawnen.
// SRP: nur verify + spawn. Kein additionalArgs (Injection-Pfad — fixer interner
// const). Asset-Select liegt in update-source-local.ts.
// HR27: < 300 Z, Funktionen < 50 Z. Kein Pfad/Stack/Secret in Fehlern.
import { statSync, existsSync } from 'node:fs'
import { extname } from 'node:path'
import { spawn } from 'node:child_process'
import { assetSpecFor, currentUpdatePlatform, type PlatformAssetSpec } from './update-platform'

// Timeout-Konstante (ms). Gilt als Sicherheitsnetz, falls 'spawn'-Event
// ausbleibt (z.B. OS-Fehler nach Child-Start ohne sofortigen 'error').
const SPAWN_CONFIRM_TIMEOUT_MS = 10_000

// Fixer NSIS-Args-Satz. KEIN additionalArgs-Parameter (Injection verboten).
const NSIS_SILENT: readonly string[] = [
  '/S',
  '/SILENT',
  '/VERYSILENT',
  '/SP-',
  '/SUPPRESSMSGBOXES'
]

/**
 * Prueft den staged Installer auf Plausibilitaet (stat-basiert).
 * Keine MZ-/SHA256-Pruefung — die liegt in update-source-local (nach Copy).
 */
export function verifyInstaller(
  filePath: string,
  spec: PlatformAssetSpec = assetSpecFor(currentUpdatePlatform())
): { valid: boolean; error: string | null } {
  try {
    const st = statSync(filePath)
    if (!st.isFile()) {
      return { valid: false, error: 'not-a-file' }
    }
    if (st.size === 0) {
      return { valid: false, error: 'empty' }
    }
    if (extname(filePath).toLowerCase() !== spec.extension) {
      return { valid: false, error: spec.wrongFormatError }
    }
    return { valid: true, error: null }
  } catch {
    // stat fehlgeschlagen (Pfad existiert nicht o.ae.) — generischer Fehler.
    return { valid: false, error: 'verify-failed' }
  }
}

/**
 * Spawnt den NSIS-Installer (detached, stdio='ignore') und resolved,
 * sobald der Child-Prozess bestaetigt gestartet ist ('spawn'-Event).
 *
 * Beide Modi (silent + GUI) nutzen denselben spawn-confirm-then-quit-Pfad:
 * - detached=true  → Child ueberlebt Parent-Exit (NSIS kann laufende EXE ersetzen).
 * - stdio='ignore' → kein offenes Pipe-Handle, das Parent-Exit blockiert.
 * - Resolve nach 'spawn' → Aufrufer ruft app.quit(); NSIS laeuft weiter.
 *
 * Begruendung vs. "auf 'close' warten" (RawaLite-Review-Finding P2#2):
 * RaWaLLMConfig ist ein Self-Replacer: der NSIS-Installer ueberschreibt die
 * laufende EXE. Wuerde der Parent auf 'close' warten, blockiert sich das System
 * selbst: NSIS wartet auf Parent-Exit; Parent wartet auf NSIS-Exit → Deadlock.
 * RawaLite installiert in ein eigenes Verzeichnis und nutzt fuer GUI-Mode
 * ebenfalls sofortiges Resolve nach Spawn (UpdateManagerService.ts Z. 1014-1019).
 *
 * KEIN additionalArgs — args kommen ausschliesslich aus NSIS_SILENT (intern).
 */
export function runInstaller(
  filePath: string,
  opts: { silent: boolean }
): Promise<{ spawned: boolean; error: string | null }> {
  return new Promise((resolve) => {
    // existsSync-Recheck unmittelbar vor spawn (Race-Guard).
    if (!existsSync(filePath)) {
      resolve({ spawned: false, error: 'installer-missing' })
      return
    }

    const args: string[] = opts.silent ? [...NSIS_SILENT] : []

    let child: ReturnType<typeof spawn>
    try {
      // detached=true + stdio='ignore': Child ueberlebt Parent-Exit,
      // kein Pipe-Handle das den Quit blockiert.
      child = spawn(filePath, args, {
        detached: true,
        stdio: 'ignore',
      })
    } catch {
      resolve({ spawned: false, error: 'spawn-failed' })
      return
    }

    // Child vom Parent-Refcount abkoppeln — Parent kann frei quiten.
    child.unref()

    let settled = false

    // Sicherheitsnetz: falls 'spawn' ausbleibt, aber kein sofortiger 'error'.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Kein 'error' nach SPAWN_CONFIRM_TIMEOUT_MS → Child laeuft wahrscheinlich.
      resolve({ spawned: true, error: null })
    }, SPAWN_CONFIRM_TIMEOUT_MS)

    child.on('spawn', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Child bestaetigt gestartet — Aufrufer kann app.quit() aufrufen.
      resolve({ spawned: true, error: null })
    })

    child.on('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ spawned: false, error: 'installer-error' })
    })
  })
}
