// path-within.ts — Segment-sichere Pfad-Containment-Pruefung fuer den Main-Layer.
// Basis: path-scope.ts isUnder (resolve+relative, kein '..'- / absoluter rel).
// Erweiterung: opts.includeEqual steuert ob Pfad-Gleichheit (rel==='') als
// "innerhalb" zaehlt (update-manager.ts isWithinBase hat Gleichheit=true hardcodiert;
// path-scope.ts isUnder hat Gleichheit=false hardcodiert). Default hier = false
// (konservativ, wie path-scope), per includeEqual=true erreichbar.
import { resolve, relative, isAbsolute } from 'node:path'

export interface PathWithinOpts {
  /** Zaehlt Pfad-Gleichheit (Basis === Ziel) als "innerhalb"? Default: false. */
  includeEqual?: boolean
}

/**
 * True, wenn `target` (absolut aufgeloest) WIRKLICH innerhalb von `base` liegt.
 * Segment-sicher: prueft ueber resolve+relative, kein naiver startsWith.
 *
 * @param base         Wurzelpfad (wird resolve'd)
 * @param target       Zu pruefender Pfad (wird resolve'd)
 * @param opts.includeEqual  Gleichheit zaehlt als "innerhalb" (default false).
 *
 * Vorlagen:
 *  - path-scope.ts isUnder: Gleichheit=NICHT-in-scope (false)
 *  - update-manager.ts isWithinBase: Gleichheit=in-scope (true)
 */
export function isPathWithin(base: string, target: string, opts?: PathWithinOpts): boolean {
  const rel = relative(resolve(base), resolve(target))
  if (rel === '') return opts?.includeEqual === true
  return !rel.startsWith('..') && !isAbsolute(rel)
}
