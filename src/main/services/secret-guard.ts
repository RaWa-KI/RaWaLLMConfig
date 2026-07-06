// secret-guard.ts — Main-seitiger Write-Guard fuer secret-bearing Pfade.
// Die Secret-Pfad-Klassifikation (Read-/Write-Strenge inkl. .md-Owner-Override)
// liegt als Single Source of Truth (SSOT) in @shared/secret-class (browser-
// sicher, Main + Renderer). Hier nur Re-Export (Pattern: dedupe-key.ts ->
// @shared/cat-key), damit alle bestehenden Main-Importer unveraendert
// './secret-guard' nutzen koennen — plus der Main-only Write-Guard
// (assertWritable), der an write-mode (Electron-Main-Singleton) haengt und
// deshalb NICHT mit nach shared/ darf.
import type { GuardVerdict } from '@shared/contract-write'
import { isSecretPathForWrite } from '@shared/secret-class'
import { isWriteEnabled } from './write-mode'

export { isSecretPathForRead, isSecretPathForWrite, isMarkdownDoc } from '@shared/secret-class'

// Grund-Text fuer verweigertes Schreiben (sichtbar im UI, kein Secret).
export const SECRET_DENY_REASON = 'owner-only/not-in-scope'

/**
 * Owner-Edit-Opt-in fuer assertWritable.
 *
 * Owner-Override ([[app-zeigt-secrets-lokal-owner-override]], mehrfach Owner-
 * bestaetigt): Die lokale App MUSS dem Owner erlauben, den INHALT EINER Datei zu
 * editieren+speichern — auch die Secret-/Settings-Klasse (settings.json,
 * auth.json, config.toml …). Diese Erlaubnis ist BEWUSST ENG: sie gilt nur fuer
 * den owner-initiierten Einzeldatei-Content-Edit (apply-Action `edit`/`add`),
 * NICHT fuer Bulk-/Ordner-Merge-/Reconcile-/Rename-/Move-Pfade. Jene behalten
 * ihr secret-skip (sonst wandern Secret-Dateien still durch Massenoperationen —
 * HR24 Folgen-/Qualitaetsgate).
 *
 * Datenverlust-Schutz haengt NICHT an diesem Guard, sondern bleibt erhalten:
 * backup-first (apply.ts), Confirm-Flow (store-write-config) und Schreibmodus.
 * Der lokale Owner-Editor zeigt roh; Watcher/Diff/Logs bleiben eigene
 * Sanitizing-Pfade.
 */
export interface WriteGuardOptions {
  // true = owner-initiierter Einzeldatei-Content-Edit (edit/add). Erlaubt die
  // Secret-/Settings-Klasse, solange der Schreibmodus AN ist. Default false =
  // strikt (Bulk-/Ordner-/Reconcile-/Rename-/Move-Pfade bleiben secret-skip).
  ownerEdit?: boolean
}

/**
 * Write-Guard: Darf der Inhalt dieses Pfads geschrieben werden?
 *
 * Default (kein ownerEdit): secret-bearing (Write-Strenge) -> verweigert mit
 * `owner-only/not-in-scope`. So bleiben alle Bulk-/Ordner-/Reconcile-/Rename-/
 * Move-Pfade unveraendert secret-skip.
 *
 * Mit `ownerEdit: true` (Einzeldatei-Content-Edit) UND aktivem Schreibmodus ist
 * die Secret-/Settings-Klasse owner-schreibbar (Owner-Override). Bei Schreibmodus
 * AUS bleibt sie auch dann verweigert. isSecretPathForRead/isSecretPathForWrite,
 * Watcher-/Diff-Maskierung (secret-mask.ts) und Agenten-/Log-Sanitisierung sind
 * davon NICHT betroffen.
 */
export function assertWritable(targetPath: string, options?: WriteGuardOptions): GuardVerdict {
  if (!isSecretPathForWrite(targetPath)) {
    return { writable: true, reason: null }
  }
  // Secret-Klasse: nur der owner-initiierte Einzeldatei-Edit bei aktivem
  // Schreibmodus darf schreiben; alles andere bleibt secret-skip.
  if (options?.ownerEdit && isWriteEnabled()) {
    return { writable: true, reason: null }
  }
  return { writable: false, reason: SECRET_DENY_REASON }
}
