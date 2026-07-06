// path-scope.ts — HARTE Wurzel-Allowlist-Durchsetzung im Main (P0-2). Begrenzt
// JEDE Mutation auf die erlaubten Config-Wurzeln (write-context.allowedRoots).
// Die Renderer-Allowlist (import.ts) ist nur UX-Vorpruefung; DIESE Funktion ist
// die echte Durchsetzung. Pruefung ist segment-sicher (resolve + relative darf
// NICHT mit '..' beginnen) — KEIN naiver startsWith-Praefix-Trick (sonst waere
// `/root-evil` faelschlich unter `/root`). KEIN throw — klares GuardVerdict.
import type { GuardVerdict } from '@shared/contract-write'
import { isPathWithin } from '../lib/path-within'

// Grund-Text fuer Out-of-Scope-Ablehnung (sichtbar im UI, kein Secret/Pfad-Leak).
export const OUT_OF_SCOPE_REASON = 'out-of-scope'

// True, wenn `child` (absolut aufgeloest) WIRKLICH innerhalb von `root` liegt.
// Gleichheit zaehlt nicht (eine Wurzel selbst ist kein Zieldatei-Pfad) ->
// includeEqual default false. Argument-Reihenfolge: isUnder(child, root) ->
// isPathWithin(root, child). SICHERHEITSKRITISCH — Verhalten identisch.
function isUnder(child: string, root: string): boolean {
  return isPathWithin(root, child)
}

/**
 * Liegt `targetPath` unter EINER der erlaubten Wurzeln? Sonst 'out-of-scope'.
 * Leere allowedRoots -> alles abgelehnt (fail-closed). Genutzt von apply fuer
 * jede mutierende Aktion (req.path; bei move zusaetzlich req.to; add: Zielpfad).
 */
export function assertInScope(targetPath: string, allowedRoots: string[]): GuardVerdict {
  if (!targetPath || allowedRoots.length === 0) {
    return { writable: false, reason: OUT_OF_SCOPE_REASON }
  }
  const inside = allowedRoots.some((root) => root && isUnder(targetPath, root))
  return inside ? { writable: true, reason: null } : { writable: false, reason: OUT_OF_SCOPE_REASON }
}
