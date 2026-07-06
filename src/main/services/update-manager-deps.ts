/**
 * update-manager-deps.ts — Injektionspunkt fuer die Electron-/Side-Effect-
 * Abhaengigkeiten des update-manager (app, backup, prefs, installer).
 * SRP: nur Deps-Interface, reale Default-Implementierung und Test-Setter.
 * Macht update-manager unter dem Node-Runner (Playwright ohne Electron)
 * importier- und testbar; Laufzeitverhalten in der App bleibt identisch.
 * HR27: < 100 Z.
 */

import { app } from 'electron'

import { exportSnapshot, DEFAULT_ARCHIVE_ROOT, type SnapshotResult } from './backup'
import { resolvePrefsStore, DEFAULT_PREFS_PATH } from './prefs-store'
import { verifyInstaller, runInstaller } from './update-installer'

// ---------------------------------------------------------------------------
// Deps-Vertrag
// ---------------------------------------------------------------------------

export interface UpdateMgrDeps {
  /** app.getVersion() — aktuelle App-Version. */
  getVersion(): string
  /** app.getPath('temp') — OS-Temp-Root fuer den Staging-Ordner. */
  getTempPath(): string
  /** app.quit() — nach bestaetigtem Installer-Spawn (R2). */
  quit(): void
  /** Pre-Snapshot der prefs-Datei (HR7) ins Archiv-Root. */
  exportPrefsSnapshot(): SnapshotResult
  /** Persistiert einen prefs-Key (z. B. updates.previousVersion). */
  resolvePrefsSet(key: string, val: string): Promise<void>
  /** Installer-Plausibilitaetspruefung (update-installer.verifyInstaller). */
  verify(filePath: string): { valid: boolean; error: string | null }
  /** Installer-Spawn (update-installer.runInstaller). */
  run(filePath: string, opts: { silent: boolean }): Promise<{ spawned: boolean; error: string | null }>
}

// ---------------------------------------------------------------------------
// Reale Default-Implementierung
// ---------------------------------------------------------------------------

/** env-Override fuer das Archiv-Root (aus update-manager.ts mitgewandert). */
function resolvedArchiveRoot(): string {
  const v = process.env.RAWALLM_ARCHIVE_ROOT?.trim()
  return v && v.length > 0 ? v : DEFAULT_ARCHIVE_ROOT
}

const realDeps: UpdateMgrDeps = {
  getVersion: () => app.getVersion(),
  getTempPath: () => app.getPath('temp'),
  quit: () => { app.quit() },
  exportPrefsSnapshot: () => exportSnapshot(DEFAULT_PREFS_PATH, resolvedArchiveRoot()),
  resolvePrefsSet: async (key, val) => {
    const store = await resolvePrefsStore()
    await store.set(key, val)
  },
  verify: verifyInstaller,
  run: runInstaller,
}

let deps: UpdateMgrDeps = realDeps

// ---------------------------------------------------------------------------
// Zugriff + Test-Setter
// ---------------------------------------------------------------------------

/** Aktive Deps (Produktion: realDeps mit Electron-app). */
export function getDeps(): UpdateMgrDeps {
  return deps
}

/**
 * NUR fuer Specs (Node-Runner ohne Electron): ueberschreibt einzelne Deps;
 * nicht gesetzte Felder fallen auf realDeps zurueck. Produktion ruft das nie.
 */
export function setUpdateMgrDepsForTest(partial: Partial<UpdateMgrDeps>): void {
  deps = { ...realDeps, ...partial }
}
