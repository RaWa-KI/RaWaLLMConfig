// manifest-map.ts — EINE zentrale, kategoriebewusste Manifest-Erkennung.
// Ersetzt die drei verstreuten SKILL/AGENT-Regexe (manifest-path.ts, dedupe.ts,
// reconcile-folder.ts) durch eine gemeinsame Quelle und erkennt zusaetzlich
// Teams-/Plugins-Manifeste als ORDNER-Anker — damit Teams-/Plugins-Ordner-Paare
// den rekursiven Ordner-Vergleich (compareDirs) erreichen statt eines
// Einzeldatei-Diffs (nur das Manifest sichtbar, Inhalte fehlen).
//
// REINE String-/const-Logik: KEIN node:fs, KEIN node:path, KEIN React/Electron.
// Wird von Renderer UND Main importiert. Trenner-treu ('/' und '\') wie
// manifest-path.ts: Match auf normalisiertem Pfad, dirname mit Original-Trenner.
//
// HARTE AUFLAGE (kritiker P1-B + P1): config.json / plugin.json / package.json
// sind GENERISCHE Basenames und kommen auch ausserhalb von Teams-/Plugins-Ordnern
// vor (z.B. mcp-Scan-Manifeste mcp_server.json/server.json/plugin.json, beliebige
// package.json). Ein reiner Basename-Regex (wie bei SKILL.md/AGENT.md) waere
// daher ein Falschpositiv-Risiko. Diese Map verlangt fuer die generischen
// Basenames ZWINGEND DIREKTE Elternschaft (genau ein Ordnersegment): config.json
// nur als .../teams/<segment>/config.json, plugin.json/package.json nur als
// .../plugins/<segment>/<manifest>. Ein blosses Vorkommen von /teams/ bzw.
// /plugins/ irgendwo im Pfad reicht NICHT (sonst waere z.B.
// .../plugins/x/node_modules/y/package.json faelschlich ein Ordner-Anker).
// installed_plugins.json ist BEWUSST NICHT gemappt (geteilter Inventar-Pfad,
// WP-07). README.md/index.md sind BEWUSST NICHT gemappt (kommen auch freistehend
// als Kategorie-Dateien vor).

// Manifest-Basenames, die in JEDEM Kontext ein Item-Ordner-Anker sind
// (Skill-/Agent-Definitionsdatei — existiert nur INNERHALB eines Item-Ordners).
// Bestehendes Verhalten 1:1: Gleichlauf mit dem alten (SKILL|AGENT)\.md-Regex.
const ALWAYS_MANIFEST_RX = /(^|\/)(SKILL|AGENT)\.md$/i

// Generische Basenames -> Anker NUR bei DIREKTER Elternschaft: das Manifest muss
// GENAU ein Ordnersegment unter /teams/ bzw. /plugins/ liegen (Item-Ordner).
// HARTE AUFLAGE (kritiker P1): ein blosses Vorkommen von /teams/ bzw. /plugins/
// IRGENDWO im Pfad ist zu lax — tief verschachtelte Treffer wie
// .../plugins/x/node_modules/y/package.json oder plugin.json DIREKT unter dem
// plugins-Root (ohne Bundle-Zwischenordner) sind KEINE Item-Ordner-Anker.
// Darum je Eintrag EIN kombinierter Regex auf der toSlash-Normalform.
const CONTEXT_MANIFEST_RX: ReadonlyArray<RegExp> = [
  // config.json nur direkt im Team-Ordner: .../teams/<einSegment>/config.json
  /(^|\/)teams\/[^/]+\/config\.json$/i,
  // plugin.json nur direkt im Plugin-Bundle: .../plugins/<einSegment>/plugin.json
  /(^|\/)plugins\/[^/]+\/plugin\.json$/i,
  // package.json nur direkt im Plugin-Bundle: .../plugins/<einSegment>/package.json
  /(^|\/)plugins\/[^/]+\/package\.json$/i
]

/** Pfad mit '/'-Trennern (Match-Normalform); Original bleibt fuer dirname erhalten. */
function toSlash(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * True, wenn `path` ein Item-Ordner-Manifest ist — KONTEXT-BEWUSST:
 *   - SKILL.md / AGENT.md: in jedem Kontext (Item-Ordner-Definition).
 *   - config.json: NUR direkt im Team-Ordner (.../teams/<segment>/config.json).
 *   - plugin.json / package.json: NUR direkt im Plugin-Bundle
 *     (.../plugins/<segment>/<manifest>).
 * README.md/index.md/installed_plugins.json sind bewusst NICHT gemappt.
 */
export function isManifestPath(path: string): boolean {
  if (!path) return false
  const slash = toSlash(path)
  if (ALWAYS_MANIFEST_RX.test(slash)) return true
  for (const rx of CONTEXT_MANIFEST_RX) {
    if (rx.test(slash)) return true
  }
  return false
}

/**
 * Eltern-Ordner (dirname) eines Pfades — trenner-treu, String-only (wie dirOf in
 * manifest-path.ts): Match auf '/'-Normalform, Ergebnis mit Original-Trenner.
 */
export function manifestParent(path: string): string {
  const norm = toSlash(path).replace(/\/+$/, '')
  const cut = norm.lastIndexOf('/')
  if (cut <= 0) return norm
  const parent = norm.slice(0, cut)
  // Original-Trenner beibehalten (Windows-Backslash falls vorhanden).
  return path.includes('\\') ? parent.replace(/\//g, '\\') : parent
}

/**
 * Ordnerpfad fuer einen Eintrag, dessen Aktionen den ORDNER treffen sollen:
 * bei Manifest-Pfaden der enthaltende Ordner, sonst der Pfad unveraendert
 * (bereits ein Ordner, z.B. wenn eine Seite direkt auf den Item-Ordner zeigt).
 */
export function manifestFolder(path: string): string {
  return isManifestPath(path) ? manifestParent(path) : path
}
