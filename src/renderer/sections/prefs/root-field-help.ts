// root-field-help.ts — reine Hilfsfunktionen fuer die Verzeichnis-Felder der
// Einstellungen. KEIN fs/path im Renderer: alles rein string-basiert.

export type RootFieldKey = 'roots.sharedClaude' | 'roots.workspaceParent' | 'roots.projectRoot'

/** Pfad fuer den Vergleich vereinheitlichen (Slash, kein Trailing, Kleinschreibung). */
function normalize(value: string): string {
  return (value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
}

/** True, wenn beide Felder auf denselben Ordner zeigen (beide gesetzt). */
export function sameFolder(a: string, b: string): boolean {
  const left = normalize(a)
  const right = normalize(b)
  return left.length > 0 && left === right
}

/**
 * Der tatsaechlich wirksame Pfad eines Feldes.
 *
 * Der gemeinsame Konfigurationsordner meint intern die `.claude`-Ebene DARUNTER:
 * gibt der Nutzer `…\Projekte\.shared` an, arbeitet die App mit
 * `…\Projekte\.shared\.claude` (Main: config-root-resolution.normalizeSharedClaude).
 * Diese Umschreibung war unsichtbar — der Eintrag wirkte wie ignoriert (F9).
 * Zeigt der Wert bereits auf `.claude`, gibt es nichts zu zeigen (null).
 * Die anderen beiden Felder werden unveraendert uebernommen -> ebenfalls null.
 */
export function effectiveRootPath(key: RootFieldKey, value: string): string | null {
  if (key !== 'roots.sharedClaude') return null
  const trimmed = (value ?? '').trim()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[\\/]+$/, '')
  const last = cleaned.split(/[\\/]/).pop() ?? ''
  if (last === '.claude') return null
  const sep = cleaned.includes('/') && !cleaned.includes('\\') ? '/' : '\\'
  return `${cleaned}${sep}.claude`
}
