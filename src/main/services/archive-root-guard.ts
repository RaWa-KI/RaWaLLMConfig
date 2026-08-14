// archive-root-guard.ts — fail-closed Validierung des konfigurierbaren
// Backup-Archivpfads (Security-Finding 2026-08-14: unvalidierter archiveRoot-
// Pref). Bisher las der Main-Prozess prefs.archiveRoot als rohen String und
// nutzte ihn ungeprueft als Backup-Ziel: ein kompromittierter Renderer haette
// das Archiv auf einen fremdlesbaren Ort (geteilt/temp/synced) zeigen lassen
// und so rohe, bewusst unmaskierte Pre-Mutation-Backups abgezweigt; ein Archiv
// INNERHALB eines Scan-/Config-Baums wuerde die Rohkopien zusaetzlich ueber
// Scan/Export sichtbar machen und Verzeichnis-Snapshots rekursiv verschaerfen.
// Regeln: absolut, kein Laufwerks-/UNC-Root, kein Symlink-/Junction-Ziel,
// kein Overlap (in beide Richtungen) mit gescannten oder schreibbaren
// Config-Roots. Keine Secret-/Wert-Ausgabe; Ablehngruende sind Schluessel.
import { lstatSync, realpathSync } from 'node:fs'
import { isAbsolute, parse, resolve } from 'node:path'
import { isPathEqualOrUnder, normalizePathForCompare } from '@shared/path-compare'
import { configRootList } from './config-roots'

export type ArchiveRootRejection =
  | 'empty'
  | 'not-absolute'
  | 'drive-root'
  | 'symlink'
  | 'config-root-overlap'

export interface ArchiveRootVerdict {
  ok: boolean
  reason: ArchiveRootRejection | null
}

const VERDICT_OK: ArchiveRootVerdict = { ok: true, reason: null }

/**
 * Verbotsliste: alle gescannten Roots (Basis + Nutzer-Zusatzquellen) —
 * Roh-Backups gehoeren in keinen dieser Baeume und keiner dieser Baeume unter
 * das Archiv. Dedupliziert ueber den Vergleichs-Key. Basis ist bewusst
 * configRootList() (existiert vor dem WP-01-Grant-Modell): die gescannten
 * Baeume sind die Leak-Quelle des Findings.
 */
export function forbiddenArchiveRoots(): string[] {
  const seen = new Map<string, string>()
  for (const root of configRootList()) {
    if (typeof root !== 'string' || !root.trim()) continue
    seen.set(normalizePathForCompare(root, process.platform), root)
  }
  return [...seen.values()]
}

/**
 * Prueft einen Archiv-Root-Kandidaten fail-closed. Nicht vorhandene Pfade sind
 * zulaessig (werden bei Bedarf angelegt); existierende Symlinks/Junctions und
 * realpath-Abweichungen (Umleitungen) werden abgelehnt.
 */
export function archiveRootVerdict(candidateRaw: string, forbiddenRoots: string[]): ArchiveRootVerdict {
  const candidate = candidateRaw.trim()
  if (!candidate) return { ok: false, reason: 'empty' }
  if (!isAbsolute(candidate)) return { ok: false, reason: 'not-absolute' }
  const normalized = resolve(candidate)
  if (parse(normalized).root === normalized) return { ok: false, reason: 'drive-root' }
  try {
    if (lstatSync(normalized).isSymbolicLink()) return { ok: false, reason: 'symlink' }
    const real = realpathSync(normalized)
    if (normalizePathForCompare(real, process.platform) !== normalizePathForCompare(normalized, process.platform)) {
      return { ok: false, reason: 'symlink' }
    }
  } catch { /* Pfad noch nicht vorhanden: zulaessig — wird bei Bedarf angelegt. */ }
  for (const root of forbiddenRoots) {
    if (isPathEqualOrUnder(normalized, root, process.platform)
      || isPathEqualOrUnder(root, normalized, process.platform)) {
      return { ok: false, reason: 'config-root-overlap' }
    }
  }
  return VERDICT_OK
}
