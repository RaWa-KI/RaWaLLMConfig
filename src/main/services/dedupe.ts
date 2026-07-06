// Dubletten-Erkennung mit TRUNK-FIRST-Semantik (read-only).
// Verglichen wird NUR: Mirror-/Spiegel-Pfade INNERHALB derselben Tool-Familie
// (Claude<->Claude, Codex<->Codex). Das sind echte INTERNE Duplikate.
// Cross-Tool-Paare (Shared<->Codex, Shared<->Claude, Claude<->Codex) sind KEINE
// Dubletten einer Tool-Familie mehr — sie sind Cross-Tool-Abdeckung und werden
// in der Spiegelungs-Sicht (coverage) gefuehrt, nicht hier.
// Zwei SEPARATE Tools (z.B. Claude <-> Codex) werden NIE als Dublette gewertet —
// Codex ist ein eigenstaendiges Tool, keine Claude-Kopie.
// verdict = SHA-256-Vergleich der realen ROH-Dateiinhalte (Wahrheit = Hash).
// WP-D1: Einzeldatei-Paare liefern fuer JEDE Klasse vergleichbare `lines`
// (Service-API `compareSingleFile` in dedupe-content.ts): same -> alle ctx,
// diff -> LCS, Secret-Klasse -> MASKIERTE Zeilen (Anzeige maskiert, Verdict aus
// ROH-SHA), oversize -> gekappter Vergleich + linesTruncated. Ordner-Paare via
// compareDirs (Inhalt je Datei on-demand). Secret-Werte nie roh ausgegeben.
// Alle fs-Zugriffe in try/catch.

import type {
  ConfigEntry,
  DiffLine,
  DirCompare,
  DuplicateSet,
  LlmConfig,
  Verdict
} from '@shared/contract'
import { isManifestPath, manifestParent } from '@shared/manifest-map'
import { compareDirs } from './dir-compare'
import { compareSingleFile } from './dedupe-content'
import type { SingleFileCompare } from './dedupe-content'
import { hashFile, isDirSafe, isFileSafe, resolvePath } from './dedupe-fs'
import { sameFamilyDifferentRoot } from './dedupe-heuristics'
import { normalizeCat, normalizeKey } from './dedupe-key'

// Pfad-Heuristik fuer denselben-Tool-Mirror (kein echtes zweites Tool).
const MIRROR_RX = /mirror|studio|spiegel|pre-junction|backup/i

// Ein Vorkommen eines benannten Entries (Familie + Kategorie + Entry).
interface Occurrence {
  family: string
  cat: string
  entry: ConfigEntry
}

/** Fuellt je LlmConfig.duplicates (DuplicateSet[]) in-place. Mutiert data. */
export function findDuplicates(data: Record<string, LlmConfig>): void {
  try {
    const byName = collectByName(data)
    const out: Record<string, DuplicateSet[]> = {}
    for (const family of Object.keys(data)) out[family] = []

    for (const occ of byName.values()) {
      if (occ.length < 2) continue
      buildSetsForName(occ, out)
    }

    for (const family of Object.keys(data)) {
      data[family].duplicates = out[family] ?? []
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

/** Indexiert alle Entries nach normalisiertem entry.name ueber alle Familien/Kategorien. */
function collectByName(data: Record<string, LlmConfig>): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>()
  for (const [family, cfg] of Object.entries(data)) {
    for (const cat of cfg?.categories ?? []) {
      for (const entry of cat.entries ?? []) {
        if (isMemoryEntry(entry)) continue // _memory ist kein echter Agent
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
      const cmp = compare(trunk, mirror)
      // Set je beteiligter Familie mit deren EIGENER (gueltiger) Kategorie-id.
      storeSet(out, a.family, a.cat, trunk, mirror, cmp, confidence)
      if (b.family !== a.family) storeSet(out, b.family, b.cat, trunk, mirror, cmp, confidence)
    }
  }
}

// Ergebnis eines Paar-Vergleichs (Einzeldatei ODER Ordner).
interface CompareResult {
  verdict: Verdict
  note: string
  lines: DiffLine[]
  dir?: DirCompare
  masked: boolean // true = lines maskiert (Secret-Klasse) — Anzeige nicht entmaskieren
  linesTruncated: boolean // true = lines gekappt (Datei zu gross)
}

/**
 * SHA-256-Vergleich + sprechende Notiz; Verzeichnis-Paare via compareDirs.
 * WP-D1: Einzeldatei-Paare liefern jetzt fuer JEDE Klasse vergleichbare `lines`
 * (same -> alle ctx; diff -> LCS; secret -> maskiert; oversize -> gekappt). Der
 * Verdict bleibt strikt aus dem ROH-SHA (Wahrheit = Hash, Anzeige ggf. maskiert).
 */
function compare(trunk: Occurrence, mirror: Occurrence): CompareResult {
  const dirResult = compareAsDirs(trunk, mirror)
  if (dirResult) return dirResult
  const ht = hashFile(trunk.entry.path)
  const hm = hashFile(mirror.entry.path)
  let verdict: Verdict = 'diff'
  let detail = 'Inhalt nicht vergleichbar'
  let comparable = false
  if (ht !== null && hm !== null) {
    verdict = ht === hm ? 'same' : 'diff'
    detail = verdict === 'same' ? 'Inhalt identisch (SHA-256)' : 'Inhalt unterscheidet sich'
    comparable = true
  }
  // Inhalt fuer JEDE Klasse liefern (auch same/secret/oversize) — wiederverwendbare
  // Service-API (Baum konsumiert dieselben Daten). Verdict bleibt aus ROH-SHA.
  const content = comparable ? loadSingleContent(trunk, mirror, verdict) : EMPTY_CONTENT
  return {
    verdict,
    note: `${trunk.family} ↔ ${mirror.family}: ${detail}`,
    lines: content.lines,
    masked: content.masked,
    linesTruncated: content.truncated
  }
}

// Leeres Inhalts-Ergebnis (wenn ein Hash nicht ermittelbar war).
const EMPTY_CONTENT: SingleFileCompare = { lines: [], masked: false, truncated: false }

/** Loest beide Pfade auf und liefert die Einzeldatei-Inhalts-Lieferung (Service-API). */
function loadSingleContent(trunk: Occurrence, mirror: Occurrence, verdict: Verdict): SingleFileCompare {
  const at = resolvePath(trunk.entry.path)
  const am = resolvePath(mirror.entry.path)
  if (!at || !am) return EMPTY_CONTENT
  return compareSingleFile(at, am, verdict)
}

/**
 * Verzeichnis-Pfad? Dann rekursiver Ordner-Vergleich (Skills/Agents sind Ordner).
 * Liefert null, wenn nicht beidseitig ein absolutes Verzeichnis ist (-> Einzeldatei).
 * Ordner-Inhalt wird je Datei on-demand im Renderer geladen (dir.files-Pfade),
 * daher set-level lines=[] und masked=false; truncated steckt in dir.truncated.
 */
function compareAsDirs(trunk: Occurrence, mirror: Occurrence): CompareResult | null {
  const at = toCompareDir(trunk.entry.path)
  const am = toCompareDir(mirror.entry.path)
  if (!at || !am) return null
  const dir = compareDirs(at, am)
  if (!dir) return null
  const clean = dir.diffCount === 0 && dir.trunkOnlyCount === 0 && dir.mirrorOnlyCount === 0
  const verdict: Verdict = clean ? 'same' : 'diff'
  const note =
    `${trunk.family} ↔ ${mirror.family}: Ordner — ${dir.sameCount} gleich, ` +
    `${dir.diffCount} abweichend, ${dir.trunkOnlyCount} nur Trunk, ${dir.mirrorOnlyCount} nur Mirror`
  return { verdict, note, lines: [], dir, masked: false, linesTruncated: false }
}

/**
 * Liefert den zu vergleichenden ORDNER fuer einen Eintragspfad oder null.
 * Scanner-Asymmetrie: Eine Seite zeigt auf den Item-Ordner selbst, die andere
 * auf seine Manifestdatei (SKILL.md/AGENT.md bzw. teams/config.json,
 * plugins/plugin.json). BEIDE Seiten muessen auf denselben Item-Ordner
 * abgebildet werden, damit der rekursive Ordner-Vergleich ALLE innenliegenden
 * Dateien erfasst (nicht nur das Manifest).
 * Echte Einzeldateien (rules/hooks/settings) liefern null -> Einzeldatei-Diff.
 * Manifest-Erkennung + dirname-String kommen ZENTRAL aus @shared/manifest-map
 * (kontext-bewusst); die fs-Checks (isDirSafe/isFileSafe) bleiben hier.
 */
function toCompareDir(rawPath: string): string | null {
  const abs = resolvePath(rawPath)
  if (!abs) return null
  if (isDirSafe(abs)) return abs
  // Manifestdatei eines Item-Ordners -> der enthaltende Ordner (String aus Map).
  if (isFileSafe(abs) && isManifestPath(abs)) {
    const parent = manifestParent(abs)
    return isDirSafe(parent) ? parent : null
  }
  return null
}

/** Legt ein DuplicateSet fuer eine Familie mit deren Kategorie-id ab. */
function storeSet(
  out: Record<string, DuplicateSet[]>,
  family: string,
  cat: string,
  trunk: Occurrence,
  mirror: Occurrence,
  cmp: CompareResult,
  confidence: NonNullable<DuplicateSet['confidence']>
): void {
  // Gegenseiten-Familie: ist diese Familie der Trunk, ist die Gegenseite der Mirror,
  // sonst der Trunk. Fuer die shared-Familie ergibt das 'claude' bzw. 'codex' und
  // erlaubt dem Renderer den [Claude|Codex]-Umschalter (nur eine Spiegel-Seite).
  const mirrorFamily = trunk.family === family ? mirror.family : trunk.family
  const set: DuplicateSet = {
    cat,
    name: trunk.entry.name,
    verdict: cmp.verdict,
    trunk: { path: trunk.entry.path, updated: trunk.entry.updated ?? '' },
    mirror: { path: mirror.entry.path, updated: mirror.entry.updated ?? '' },
    note: cmp.note,
    lines: cmp.lines,
    mirrorFamily: mirrorFamily as DuplicateSet['mirrorFamily'],
    confidence
  }
  if (cmp.dir) set.dir = cmp.dir // nur bei Verzeichnis-Dubletten; Einzeldatei bleibt undefined
  if (cmp.masked) set.masked = true // Secret-Klasse: Anzeige nicht entmaskieren
  if (cmp.linesTruncated) set.linesTruncated = true // gekappter Vergleich
  pushUnique(out, family, set)
}

/** Set genau einmal pro Familie ablegen (cat + Pfad-Paar als Dedupe-Key). */
function pushUnique(out: Record<string, DuplicateSet[]>, family: string, set: DuplicateSet): void {
  const list = out[family] ?? (out[family] = [])
  const key = `${set.cat}|${set.trunk.path}|${set.mirror.path}`
  if (!list.some((s) => `${s.cat}|${s.trunk.path}|${s.mirror.path}` === key)) list.push(set)
}

/** Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe. */
function fail(where: string, err: unknown): void {
  console.error(`[scan:dedupe:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
