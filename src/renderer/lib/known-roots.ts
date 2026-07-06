// known-roots.ts (Teil C, Import-Verdrahtung). Leitet die REALEN, schreibbaren
// Config-Wurzeln aus den bereits geladenen Config-Daten ab — KEIN neuer IPC, KEIN
// fs/path (Main bleibt Single Source via configRootList()). Jeder ConfigEntry/
// Category traegt einen realen absoluten Pfad (z.B. C:\Users\…\.claude\settings.json);
// die schreibbare Wurzel ist das Praefix bis einschliesslich des Allowlist-Segments:
//   .codex                       -> …/.codex
//   .claude (nicht nach .shared) -> …/.claude
//   .shared/.claude              -> …/.shared/.claude  (zwei-Segment-Trunk-Wurzel)
// So bleibt die Allowlist hart (nur .claude/.codex/.shared je WS) und der Dialog
// bietet exakt die Wurzeln, in die der Write-Guard tatsaechlich schreiben darf.
import type { AppData } from '@shared/contract'

// Allowlist-Segmente (Spiegel von import-targets.ALLOWED_ROOT_SEGMENTS). Bewusst
// dupliziert klein gehalten: dieses Modul kennt nur die Wurzel-Ableitung, nicht
// die Secret-/Foreign-Klassifikation.
const ROOT_SEGMENTS = new Set(['.claude', '.codex', '.shared'])

// WS-/projectRoot-Segment: der Main-Write-Scope (config-roots.ConfigRoots)
// enthaelt ausser .claude/.codex/.shared auch den Projekt-Root (.../RaWaLLMConfig),
// der KEIN Allowlist-Segment traegt. Pfade darunter sind im Main schreibbar, also
// muss die Renderer-Wurzel-Ableitung sie ebenfalls anbieten (B1: Renderer-Scope
// = Main-Scope). Spiegel von import-targets.PROJECT_ROOT_SEGMENT.
const PROJECT_ROOT_SEGMENT = 'rawallmconfig'

// Pfad in normalisierte Roh-Segmente zerlegen (Backslash -> Slash). Gross-/
// Kleinschreibung bleibt erhalten (echter Pfad fuer den Write-Guard).
function rawSegments(p: string): string[] {
  return p.replace(/\\/g, '/').split('/').filter(Boolean)
}

// Aus einem realen absoluten Pfad die schreibbare Wurzel ableiten (oder null,
// wenn weder ein Allowlist-Segment noch der projectRoot vorkommt). Beim LETZTEN
// Allowlist-Segment kappen; `.shared` zieht ein direkt folgendes `.claude` als
// zwei-Segment-Wurzel mit. Faellt ein Pfad NICHT unter .claude/.codex/.shared,
// aber unter den projectRoot (.../RaWaLLMConfig), wird beim projectRoot gekappt
// (B1: WS-Root ist im Main schreibbar, also auch hier eine waehlbare Wurzel).
function rootOf(absPath: string): string | null {
  const segs = rawSegments(absPath)
  const lc = segs.map((s) => s.toLowerCase())
  let idx = -1
  for (let i = 0; i < lc.length; i++) {
    if (ROOT_SEGMENTS.has(lc[i])) idx = i
  }
  if (idx !== -1) {
    let end = idx + 1
    if (lc[idx] === '.shared' && lc[idx + 1] === '.claude') end = idx + 2
    return segs.slice(0, end).join('/')
  }
  // Kein Allowlist-Segment: projectRoot-Fallback (letztes Vorkommen kappen).
  let pidx = -1
  for (let i = 0; i < lc.length; i++) {
    if (lc[i] === PROJECT_ROOT_SEGMENT) pidx = i
  }
  if (pidx === -1) return null
  return segs.slice(0, pidx + 1).join('/')
}

// Alle realen Pfade aus den Config-Daten einsammeln (Kategorie-Pfade +
// Eintrags-Pfade ueber alle LLM-Familien). Nur nicht-leere Strings.
function collectPaths(data: AppData | null): string[] {
  if (!data) return []
  const out: string[] = []
  for (const cfg of Object.values(data.data)) {
    for (const cat of cfg.categories) {
      if (cat.path) out.push(cat.path)
      for (const e of cat.entries) if (e.path) out.push(e.path)
    }
  }
  return out
}

/**
 * Schreibbare Config-Wurzeln (real, absolut) aus den geladenen Config-Daten.
 * Dedupliziert, Reihenfolge = erstes Vorkommen. Leeres Array, wenn keine Daten
 * geladen sind oder kein Pfad ein Allowlist-Segment traegt (Dialog zeigt dann
 * keine Ziel-Optionen -> Confirm bleibt fuer ready-Items leer/abgeschaltet).
 */
export function knownRootsFromConfig(data: AppData | null): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of collectPaths(data)) {
    const root = rootOf(p)
    if (!root) continue
    const key = root.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(root)
  }
  return out
}
