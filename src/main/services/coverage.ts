// coverage.ts — Cross-Tool-Spiegelungs-Matrix (read-only). Baut pro logischer
// Config (key = normalisierter Name + Kategorie ueber shared/claude/codex) EINE
// CoverageRow mit drei Zellen (Shared/Claude/Codex). Bidirektional: auch
// tool-only-Configs (nur Codex / nur Claude) erzeugen eine Zeile.
//
// Asymmetrie-bewusst (Bericht Teil 2): Claude bezieht Shared ueber das
// Plugin-System — fehlt eine echte ~/.claude-Datei, ist die Config aber
// plugin-lieferbar und es sind Plugins installiert -> 'via-plugin' statt
// 'fehlt'; nicht eindeutig -> 'n-a'. plugins-Kategorie -> Codex 'n-a'.
//
// Praesenz wird PRO FAMILIE als Set gefuehrt (NICHT pro Entry — sonst
// Doppelzaehlung interner Codex-Mirror). Referenz fuer den Drift = shared-Datei
// wenn vorhanden, sonst die erste vorhandene Familie. Die 'local'-Familie wird
// uebersprungen (kein Cross-Tool-Spiegel). _memory-Pseudo-Eintraege ebenso.
// Alles in try/catch (fail()-Muster); KEINE Secret-/Wert-Ausgabe.

import type {
  CoverageCell,
  CoverageRow,
  ConfigEntry,
  LlmConfig
} from '@shared/contract'
import { normalizeCat, normalizeKey } from './dedupe-key'
import {
  classifyClaude,
  classifyCodex,
  classifyPresent,
  classifyReference,
  compareDrift
} from './coverage-classify'
import type { DriftResult, FamilyPresence } from './coverage-classify'

// Familien, die in der Spiegelung erscheinen (Reihenfolge = Referenz-Vorrang).
type CoverageFamily = 'shared' | 'claude' | 'codex'
const COVERAGE_FAMILIES: CoverageFamily[] = ['shared', 'claude', 'codex']

// Gebuendelter Zustand eines logischen Config-Schluessels ueber alle Familien.
interface KeyBucket {
  cat: string // normalisierte (familienfreie) Kategorie-Achse
  name: string // Anzeige-Name (erste gesehene Familie)
  presence: Partial<Record<CoverageFamily, FamilyPresence>>
}

/**
 * Baut die Spiegelungs-Matrix ueber ALLE Familien. Liefert Rows fuer jede
 * logische Config — sowohl die 86 allein-stehenden Shared-Configs als auch
 * tool-only-Configs. Bei Fehler: leeres Array (Anzeige bleibt korrekt-leer).
 */
export function buildCoverage(data: Record<string, LlmConfig>): CoverageRow[] {
  try {
    const buckets = collectBuckets(data)
    const hasClaudePlugins = detectClaudePlugins(data)
    const rows: CoverageRow[] = []
    for (const bucket of buckets.values()) {
      rows.push(buildRow(bucket, hasClaudePlugins))
    }
    rows.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name))
    return rows
  } catch (err) {
    fail('buildCoverage', err)
    return []
  }
}

/** Filtert _memory-Ordner-Pseudo-Agents heraus (kein echter Agent) — wie dedupe. */
function isMemoryEntry(entry: ConfigEntry): boolean {
  const p = (entry.path ?? '').toLowerCase()
  return /[\\/]_memory([\\/]|$)/.test(p)
}

/**
 * Indexiert alle Entries der Coverage-Familien nach key = normalizeKey(name) +
 * ' ' + normalizeCat(cat). OHNE den '< 2'-Skip (allein-stehende Configs sollen
 * rein). Praesenz pro Familie: das ERSTE Vorkommen je Familie zaehlt — interne
 * Mirror einer Familie zaehlen nicht doppelt.
 */
function collectBuckets(data: Record<string, LlmConfig>): Map<string, KeyBucket> {
  const map = new Map<string, KeyBucket>()
  for (const family of COVERAGE_FAMILIES) {
    const cfg = data[family]
    if (!cfg) continue
    for (const cat of cfg.categories ?? []) {
      for (const entry of cat.entries ?? []) {
        if (isMemoryEntry(entry)) continue
        const nk = normalizeKey(entry.name)
        if (!nk) continue
        const ncat = normalizeCat(cat.id)
        const key = `${nk} ${ncat}`
        const bucket = map.get(key) ?? { cat: ncat, name: entry.name, presence: {} }
        // Praesenz PRO FAMILIE: erstes Vorkommen je Familie gewinnt (kein Doppelt).
        if (!bucket.presence[family]) bucket.presence[family] = { entry, cat: cat.id }
        map.set(key, bucket)
      }
    }
  }
  return map
}

/**
 * True, wenn Claude installierte Plugins hat (Inventar-Eintraege in der
 * 'plugins'-Kategorie). Grundlage fuer die via-plugin-Asymmetrie: ohne
 * installierte Plugins ist eine fehlende Claude-Datei echt 'fehlt'.
 */
function detectClaudePlugins(data: Record<string, LlmConfig>): boolean {
  const claude = data['claude']
  if (!claude) return false
  for (const cat of claude.categories ?? []) {
    if (cat.id !== 'plugins') continue
    for (const entry of cat.entries ?? []) {
      if (entry.inventory || entry.fields?.typ === 'installed_plugins.json') return true
    }
  }
  return false
}

/**
 * Bildet aus einem Bucket eine CoverageRow. Referenz = shared wenn vorhanden,
 * sonst erste vorhandene Familie. Jede Nicht-Referenz-Familie wird gegen die
 * Referenz klassifiziert; der Drilldown (lines/dir/masked) haengt am ersten
 * 'abweichend'-Vergleich (Anzeige-Hinweis, kein To-do).
 */
function buildRow(bucket: KeyBucket, hasClaudePlugins: boolean): CoverageRow {
  const ref = pickReference(bucket)
  const cells = buildCells(bucket, ref, hasClaudePlugins)
  const row: CoverageRow = {
    cat: bucket.cat,
    name: bucket.name,
    shared: cells.shared,
    claude: cells.claude,
    codex: cells.codex
  }
  attachDrift(row, cells.drift)
  return row
}

// Referenz-Familie + deren Praesenz (shared bevorzugt, sonst erste vorhandene).
function pickReference(bucket: KeyBucket): FamilyPresence | undefined {
  for (const family of COVERAGE_FAMILIES) {
    const p = bucket.presence[family]
    if (p) return p
  }
  return undefined
}

// Drift einer Familie gegen die Referenz (gleiche Familie -> identisch, kein fs).
function driftFor(
  present: FamilyPresence | undefined,
  ref: FamilyPresence | undefined
): DriftResult | undefined {
  if (!present) return undefined
  if (!ref || present.entry.path === ref.entry.path) return { verdict: 'same', lines: [], masked: false }
  return compareDrift(ref.entry.path, present.entry.path)
}

// Die drei Zellen + der (erste) Drift fuer den Drilldown bestimmen.
function buildCells(
  bucket: KeyBucket,
  ref: FamilyPresence | undefined,
  hasClaudePlugins: boolean
): { shared: CoverageCell; claude: CoverageCell; codex: CoverageCell; drift?: DriftResult } {
  const sPres = bucket.presence.shared
  const cPres = bucket.presence.claude
  const xPres = bucket.presence.codex
  const hasSingleFileEvidence = countPresent(bucket) === 1
  const sDrift = driftFor(sPres, ref)
  const cDrift = driftFor(cPres, ref)
  const xDrift = driftFor(xPres, ref)
  const shared = classifyShared(sPres, sDrift, hasSingleFileEvidence)
  const claude = cPres && hasSingleFileEvidence
    ? classifyReference(cPres)
    : classifyClaude(cPres, cDrift, bucket.cat, hasClaudePlugins)
  const codex = xPres && hasSingleFileEvidence
    ? classifyReference(xPres)
    : classifyCodex(xPres, xDrift, bucket.cat)
  return { shared, claude, codex, drift: firstAbweichend(sDrift, cDrift, xDrift) }
}

// Shared ist Referenz, aber nur Tool-only/Single-Evidence wird als "vorhanden" markiert.
function classifyShared(
  present: FamilyPresence | undefined,
  drift: DriftResult | undefined,
  hasSingleFileEvidence: boolean
): CoverageCell {
  if (!present || !drift) return { state: 'fehlt' }
  return hasSingleFileEvidence ? classifyReference(present) : classifyPresent(present, drift)
}

// Zaehlt nur echte Familien-Praesenz; via-plugin ist ein Indiz, kein Dateinachweis.
function countPresent(bucket: KeyBucket): number {
  return COVERAGE_FAMILIES.reduce((count, family) => (
    bucket.presence[family] ? count + 1 : count
  ), 0)
}

// Erster 'diff'-Drift mit Inhalt (fuer den Drilldown am Row-Level).
function firstAbweichend(...drifts: Array<DriftResult | undefined>): DriftResult | undefined {
  for (const d of drifts) {
    if (d && d.verdict === 'diff' && (d.lines.length > 0 || d.dir)) return d
  }
  return undefined
}

// Drift-Daten (lines/dir/masked) additiv an die Row haengen (nur wenn vorhanden).
function attachDrift(row: CoverageRow, drift: DriftResult | undefined): void {
  if (!drift) return
  if (drift.lines.length > 0) row.lines = drift.lines
  if (drift.dir) row.dir = drift.dir
  if (drift.masked) row.masked = true
}

/** Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe. */
function fail(where: string, err: unknown): void {
  console.error(`[scan:coverage:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
