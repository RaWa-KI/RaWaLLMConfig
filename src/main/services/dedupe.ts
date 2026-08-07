// Dubletten-Erkennung mit TRUNK-FIRST-Semantik (read-only).
// Verglichen wird NUR: Mirror-/Spiegel-Pfade INNERHALB derselben Tool-Familie
// (Claude<->Claude, Codex<->Codex). Das sind echte INTERNE Duplikate.
// Cross-Tool-Paare (Shared<->Codex, Shared<->Claude, Claude<->Codex) sind KEINE
// Dubletten einer Tool-Familie mehr — sie sind Cross-Tool-Abdeckung und werden
// in der Spiegelungs-Sicht (coverage) gefuehrt, nicht hier.
// Zwei SEPARATE Tools (z.B. Claude <-> Codex) werden NIE als Dublette gewertet —
// Codex ist ein eigenstaendiges Tool, keine Claude-Kopie.
// verdict = SHA-256-Vergleich der realen ROH-Dateiinhalte (Wahrheit = Hash).
// WP-D1: Einzeldatei-Paare liefern fuer JEDE Klasse vergleichbare `lines`.
// HR27-Split (Plan C): die Paar→Set-Konstruktion (Ordner-/Einzeldatei-Vergleich)
// liegt in dedupe-set-builder.ts und wird auch von der inhaltsbasierten Stufe
// (dedupe-content-scan.ts) genutzt. Secret-Werte nie roh ausgegeben.

import type { ConfigEntry, DuplicateSet, LlmConfig } from '@shared/contract'
import { sameFamilyDifferentRoot } from './dedupe-heuristics'
import { normalizeCat, normalizeKey } from './dedupe-key'
import { buildDuplicateSet, hiddenDecisionKeys, isHiddenByDecision, pushUniqueSet } from './dedupe-set-builder'
import type { DriftDecisionSource } from './drift-relation'
import { createDriftRelationStore } from './drift-relation-store'

// Pfad-Heuristik fuer denselben-Tool-Mirror (kein echtes zweites Tool).
const MIRROR_RX = /mirror|studio|spiegel|pre-junction|backup/i

// Ein Vorkommen eines benannten Entries (Familie + Kategorie + Entry).
interface Occurrence {
  family: string
  cat: string
  entry: ConfigEntry
}

/** Fuellt je LlmConfig.duplicates (DuplicateSet[]) in-place. Mutiert data. */
export function findDuplicates(
  data: Record<string, LlmConfig>,
  store: DriftDecisionSource = createDriftRelationStore()
): void {
  try {
    // parity/ignored-Decisions verwerfen ihre Sets (WP-F12F13): gewollte
    // Cross-Root-Paritaets-Kopien zaehlen nicht als Dublette.
    let hidden = new Set<string>()
    try {
      hidden = hiddenDecisionKeys(store.readDecisions())
    } catch {
      hidden = new Set<string>()
    }
    const byName = collectByName(data)
    const out: Record<string, DuplicateSet[]> = {}
    for (const family of Object.keys(data)) out[family] = []

    for (const occ of byName.values()) {
      if (occ.length < 2) continue
      buildSetsForName(occ, out)
    }

    for (const family of Object.keys(data)) {
      data[family].duplicates = (out[family] ?? []).filter((set) => !isHiddenByDecision(set, hidden))
    }
  } catch (err) {
    fail('findDuplicates', err)
    for (const family of Object.keys(data)) {
      if (!Array.isArray(data[family].duplicates)) data[family].duplicates = []
    }
  }
}

/** Filtert _memory-Ordner-Pseudo-Agents heraus (kein echter Agent). */
function isMemoryEntry(entry: ConfigEntry): boolean {
  const p = (entry.path ?? '').toLowerCase()
  return /[\\/]_memory([\\/]|$)/.test(p)
}

/** Instructions werden zeilenweise verglichen, aber nie als Reconcile-Duplikate gefuehrt. */
function isCompareOnlyCategory(cat: string): boolean {
  return normalizeCat(cat) === 'instructions'
}

/** Indexiert alle Entries nach normalisiertem entry.name ueber alle Familien/Kategorien. */
function collectByName(data: Record<string, LlmConfig>): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const [family, cfg] of Object.entries(data)) {
    for (const cat of cfg?.categories ?? []) {
      for (const entry of cat.entries ?? []) {
        if (isMemoryEntry(entry)) continue // _memory ist kein echter Agent
        if (isCompareOnlyCategory(cat.id)) continue
        const key = normalizeKey(entry.name)
        if (!key) continue
        const list = map.get(key) ?? []
        list.push({ family, cat: cat.id, entry })
        map.set(key, list)
      }
    }
  }
  return map
}

/** Vergleichbar als benannter Mirror oder als heuristischer Root-Split derselben Familie. */
function comparableConfidence(a: Occurrence, b: Occurrence): DuplicateSet['confidence'] | null {
  const pa = (a.entry.path ?? '').trim()
  const pb = (b.entry.path ?? '').trim()
  if (!pa || !pb || pa === pb) return null
  // Cross-Familie ist KEINE Dublette mehr: Shared<->Codex, Shared<->Claude und
  // Claude<->Codex sind Cross-Tool-Abdeckung (coverage), kein internes Tool-Duplikat.
  if (a.family !== b.family) return null
  // Kategorie-Guard auf der FAMILIENFREIEN Achse: Cross-Kategorie-Falschpositive
  // verhindern (rule 'foo' matcht nicht gegen agent 'foo'); Familien-Praefixe
  // ('shared-'/'codex-') werden gestrippt (rein interne Achse).
  if (normalizeCat(a.cat) !== normalizeCat(b.cat)) return null
  if (MIRROR_RX.test(pa) || MIRROR_RX.test(pb)) return 'named-mirror'
  return sameFamilyDifferentRoot(pa, pb) ? 'heuristic' : null
}

/** Bildet aus mehreren Vorkommen eines Namens DuplicateSets je Familie. */
function buildSetsForName(occ: Occurrence[], out: Record<string, DuplicateSet[]>): void {
  for (let i = 0; i < occ.length; i++) {
    for (let j = i + 1; j < occ.length; j++) {
      const a = occ[i]
      const b = occ[j]
      const confidence = comparableConfidence(a, b)
      if (!confidence) continue
      // Trunk = kanonische Seite (Shared); sonst a als Trunk.
      const trunk = b.family === 'shared' ? b : a
      const mirror = trunk === a ? b : a
      // Set je beteiligter Familie mit deren EIGENER (gueltiger) Kategorie-id.
      storeSet(out, a.family, a.cat, trunk, mirror, confidence)
      if (b.family !== a.family) storeSet(out, b.family, b.cat, trunk, mirror, confidence)
    }
  }
}

/** Legt ein DuplicateSet fuer eine Familie mit deren Kategorie-id ab. */
function storeSet(
  out: Record<string, DuplicateSet[]>,
  family: string,
  cat: string,
  trunk: Occurrence,
  mirror: Occurrence,
  confidence: NonNullable<DuplicateSet['confidence']>,
): void {
  // Gegenseiten-Familie: ist diese Familie der Trunk, ist die Gegenseite der Mirror,
  // sonst der Trunk. Fuer die shared-Familie ergibt das 'claude' bzw. 'codex' und
  // erlaubt dem Renderer den [Claude|Codex]-Umschalter (nur eine Spiegel-Seite).
  const mirrorFamily = (trunk.family === family ? mirror.family : trunk.family) as NonNullable<DuplicateSet['mirrorFamily']>
  const set = buildDuplicateSet(
    family,
    cat,
    trunk.entry.name,
    { path: trunk.entry.path, updated: trunk.entry.updated ?? '' },
    { path: mirror.entry.path, updated: mirror.entry.updated ?? '' },
    mirrorFamily,
    confidence,
  )
  pushUniqueSet(out[family] ?? (out[family] = []), set)
}

/** Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe. */
function fail(where: string, err: unknown): void {
  console.error(`[scan:dedupe:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
