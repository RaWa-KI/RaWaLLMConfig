// scan-index.ts — Aggregator (read-only). Verdrahtet alle Familien-Scanner zu
// AppData. Phase 1: LIEST nur das Dateisystem (zur Laufzeit via Familien-Scanner),
// schreibt/aendert NIE Config. Secrets werden nie getragen — die Scanner liefern
// nur Namen/Status/Pfade/Metadaten. Jeder Scanner ist einzeln gekapselt: faellt
// einer aus, bleibt seine Familie leer und der Rest der App lebt weiter.
import path from 'node:path'
import os from 'node:os'
import type { AppData, Category, ConfigEntry, LlmConfig, LlmDef, Machine, Snapshot } from '@shared/contract'
import { scanMcp, mcpNames } from './mcp-scan'
import { scanRegistry } from './engine/build-data'
import { buildAuditConfig } from './scan-audit-categories'
import { findDuplicates } from '../services/dedupe'
import { buildCoverage } from '../services/coverage'
import { configRoots } from '../services/config-roots'

// FIX 1: Familie-zu-Kategorie-ID-Map — jede Familie hat ihre eigene Plugins-
// Kategorie-ID (nicht hardcodiert auf 'plugins'). Ohne diese Map greift
// existingIdx=-1 fuer Codex/Shared und markConflicts wird nie aufgerufen.
const FAMILY_PLUGINS_ID: Record<'claude' | 'codex' | 'shared', string> = {
  claude: 'plugins',
  codex: 'codex-plugins',
  shared: 'shared-plugins',
}

// scanMcp()-Ergebnis je Familie in deren Kategorien einfuegen: vorhandene
// plugins-Kategorie ersetzen, sonst anhaengen. Mutiert die LlmConfig nicht
// destruktiv — baut categories neu auf.
// Owner-Punkt 7: wenn Plugin-Scan-Sicht (Ordner) und MCP-Merge-Sicht (JSON-Server)
// inhaltlich divergieren, werden betroffene Eintraege mit status:'conflict' markiert.
function mergeMcp(
  cfg: LlmConfig,
  mcp: ReturnType<typeof scanMcp>,
  fam: 'claude' | 'codex' | 'shared'
): void {
  const cat = mcp[fam]
  if (!cat) return

  // FIX 1: Richtige Kategorie-ID je Familie verwenden (nicht hartes 'plugins')
  const pluginsId = FAMILY_PLUGINS_ID[fam]
  const existingIdx = cfg.categories.findIndex((c) => c.id === pluginsId)
  const existing = existingIdx >= 0 ? cfg.categories[existingIdx] : null

  // Konflikt-Erkennung: Eintraege im MCP-Scanner vs. Plugin-Scanner-Ordner-Sicht
  // divergieren wenn ein Name in der MCP-Merge-Sicht vorkommt, aber NICHT in der
  // Ordner-basierten Scan-Sicht (oder umgekehrt). Betroffene Eintraege erhalten
  // status:'conflict' damit der Renderer sie hervorheben kann.
  // FIX 2: existing (reiche scanDir-Kategorie) als Basis behalten; MCP-Eintraege
  // nur additiv/konflikt-markiert einmischen — kein Ersetzen durch mcpCat als Basis.
  const mergedCat = markConflicts(cat, existing)
  // scan-03: buildCategory setzt immer id:'plugins'; kein Plugin-Ordner (existing=null)
  // liefert mcpCat direkt zurueck — familien-spezifische ID muss nachgezogen werden.
  mergedCat.id = pluginsId

  if (existingIdx >= 0) {
    cfg.categories.splice(existingIdx, 1, mergedCat)
  } else {
    cfg.categories.push(mergedCat)
  }
}

// Vergleicht MCP-Merge-Kategorie mit bestehender Plugin-Scanner-Kategorie.
// FIX 2: scanCat (reiche Ordner-Sicht mit entry.code/fields/path) bleibt Basis.
// MCP-only-Eintraege werden additiv angehaengt; gemeinsame Eintraege behalten
// den reichen scanCat-Eintrag und erhalten keinen conflict-Status.
// Eintraege nur in einer Sicht erhalten status:'conflict'.
function markConflicts(mcpCat: Category, scanCat: Category | null): Category {
  // Kein existing scanCat: MCP-Kategorie unveraendert uebernehmen
  if (!scanCat) return mcpCat

  const mcpSet = mcpNames(mcpCat)
  const scanSet = mcpNames(scanCat)

  // Eintraege die nur im MCP-Merge vorhanden (fehlen im Ordner-Scan)
  const onlyInMcp = new Set([...mcpSet].filter((n) => !scanSet.has(n)))
  // Eintraege die nur im Ordner-Scan vorhanden (nicht im MCP-Register)
  const onlyInScan = new Set([...scanSet].filter((n) => !mcpSet.has(n)))

  if (onlyInMcp.size === 0 && onlyInScan.size === 0) {
    // Kein Konflikt: reiche scanCat unveraendert zurueckgeben (FIX 2: nicht mcpCat)
    return scanCat
  }

  // FIX 2: Basis = scanCat-Eintraege (reich: code/fields/path erhalten).
  // Ordner-Eintraege die nur im Ordner-Scan: Konflikt-Status setzen.
  // F4: Plugin-INVENTAR-Eintraege (fields.typ === 'installed_plugins.json') sind
  // KEINE MCP-Server — ein installiertes Plugin ohne MCP-Register-Eintrag ist
  // kein Konflikt. Sie behalten ihren Status (keine only-in-scan-Markierung),
  // sonst entstehen Falschpositive (37 Plugins -> 39 statt 2 Konflikte).
  const mergedEntries: ConfigEntry[] = scanCat.entries.map((e) => {
    const isPluginInventory = e.fields?.typ === 'installed_plugins.json'
    if (onlyInScan.has(e.name) && !isPluginInventory) {
      return {
        ...e,
        status: 'conflict',
        desc: e.desc,
        conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
      }
    }
    return e
  })

  // MCP-only-Eintraege additiv anhaengen mit Konflikt-Status
  for (const e of mcpCat.entries) {
    if (onlyInMcp.has(e.name)) {
      mergedEntries.push({
        ...e,
        status: 'conflict',
        desc: e.desc,
        conflictReason: 'Nur im MCP-Register — fehlt im Plugin-Ordner',
      })
    }
  }

  // FIX 2: { ...scanCat } als Basis (nicht mcpCat) — Label/Icon/blurb der
  // reichen scanDir-Kategorie bleiben erhalten.
  return { ...scanCat, entries: mergedEntries }
}

function isUnderRoot(rawPath: string, rawRoot: string): boolean {
  if (!rawPath || !rawRoot) return false
  const filePath = path.resolve(rawPath).toLowerCase()
  const rootPath = path.resolve(rawRoot).toLowerCase()
  return filePath === rootPath || filePath.startsWith(rootPath + path.sep)
}

function cloneUserEntry(entry: ConfigEntry, source: string, sourceLabel: string): ConfigEntry {
  return {
    ...entry,
    id: `userglobal-${source}-${entry.id}`,
    scope: 'global',
    origin: `${sourceLabel} · Userglobal`,
    fields: { ...(entry.fields ?? {}), Werkzeug: sourceLabel, Ebene: 'Userglobal' }
  }
}

function cloneUserCategory(cat: Category, source: string, sourceLabel: string, root: string): Category | null {
  const entries = cat.entries
    .filter((entry) => isUnderRoot(entry.path, root))
    .map((entry) => cloneUserEntry(entry, source, sourceLabel))
  if (entries.length === 0) return null
  const baseId = cat.id.replace(/^(codex|shared)-/, '')
  return {
    ...cat,
    id: `userglobal-${source}-${baseId}`,
    label: `${sourceLabel} · ${cat.label}`,
    path: isUnderRoot(cat.path, root) ? cat.path : root,
    blurb: `Userglobale ${sourceLabel}-Dateien: ${cat.blurb}`,
    entries
  }
}

function buildUserglobal(data: Record<string, LlmConfig>): LlmConfig {
  const roots = configRoots()
  const sources = [
    { key: 'claude', label: 'Claude', root: roots.claudeHome },
    { key: 'codex', label: 'Codex', root: roots.codexHome }
  ]
  const categories: Category[] = []
  for (const source of sources) {
    for (const cat of data[source.key]?.categories ?? []) {
      const userCat = cloneUserCategory(cat, source.key, source.label, source.root)
      if (userCat) categories.push(userCat)
    }
  }
  return { categories, duplicates: [] }
}

// data-Block bauen: alle Familien ueber die Provider-Registry scannen
// (scanRegistry: shared, claude, codex, local — inkl. llm-comingSoon-Frueh-Return
// und je Familie durchgereichten diffLabels), dann MCP-Kategorien einmischen und
// userglobal ableiten. Reihenfolge unveraendert zum hartcodierten M1-Stand.
// mergeMcp/buildUserglobal sind additiv exportiert (B-5: Build-Data-Equivalence-
// Spec konstruiert daraus die legacyBuildData()-Referenz) — Logik unveraendert.
function buildData(): Record<string, LlmConfig> {
  const data = scanRegistry()
  try {
    const mcp = scanMcp()
    mergeMcp(data.claude, mcp, 'claude')
    mergeMcp(data.codex, mcp, 'codex')
    mergeMcp(data.shared, mcp, 'shared')
  } catch (err) {
    console.error('[scan:mcp]', err instanceof Error ? err.message : 'scan-error')
  }
  data.userglobal = buildUserglobal(data)
  return data
}

// B-5: additive Exporte fuer den Build-Data-Equivalence-Spec. mergeMcp +
// buildUserglobal + buildData werden im Test gegen eine legacyBuildData()-Referenz
// (direkte Alt-Scanner-Aufrufe) deep-equal verglichen. NUR Sichtbarmachung —
// KEINE Logikaenderung. scanMcp wird im Test direkt aus mcp-scan importiert.
export { mergeMcp, buildUserglobal, buildData, buildLlms }

// Eine Familie gilt als "befuellt", wenn sie mindestens einen Eintrag hat.
// Guard gegen fehlende Familie (z.B. data.cloud bei Scan-Fehler) -> nicht crashen.
function hasEntries(cfg: LlmConfig | undefined): boolean {
  return !!cfg && cfg.categories.some((c) => c.entries.length > 0)
}

// LlmDef-Liste (Sidebar). Glyph/Name/Sub/Color/Path wie im Bauplan; coming
// abhaengig davon, ob die jeweilige Familie reale Eintraege geliefert hat.
// Teil D: 'cloud' (OpenAI/Anthropic/Gemini) als feste Familie; nutzerdefinierte
// Manifest-Familien (D6) generisch angehaengt (jede data-Familie ausserhalb der
// bekannten Liste). Farben/Glyphen der neuen Familien sind v1-Defaults (Teil C UI).
function buildLlms(data: Record<string, LlmConfig>): LlmDef[] {
  // A8-1: coming-Logik von Scan-Fehlern entkoppelt — eine gecrashte Familie
  // (data.X.scanError gesetzt) ist NICHT 'coming' (bleibt klickbar) und traegt
  // scanError durch. So wird ein Scan-Crash nicht als "bald" getarnt/deaktiviert.
  const known: LlmDef[] = [
    { id: 'shared', glyph: '⊕', name: 'Shared', sub: 'Cross-Workspace', color: 'var(--sage)', path: '.shared', coming: !hasEntries(data.shared) && !data.shared?.scanError, scanError: data.shared?.scanError },
    { id: 'userglobal', glyph: '◎', name: 'Userglobal', sub: '~/.claude + ~/.codex', color: 'var(--amber)', path: '~', coming: !hasEntries(data.userglobal) && !data.userglobal?.scanError, scanError: data.userglobal?.scanError },
    { id: 'claude', glyph: '✳', name: 'Claude', sub: 'Anthropic', color: 'var(--terra)', path: '~/.claude', coming: !hasEntries(data.claude) && !data.claude?.scanError, scanError: data.claude?.scanError },
    { id: 'codex', glyph: '◇', name: 'Codex', sub: 'OpenAI', color: 'var(--papa)', path: '~/.codex', coming: !hasEntries(data.codex) && !data.codex?.scanError, scanError: data.codex?.scanError },
    { id: 'local', glyph: '▢', name: 'Lokal', sub: 'llama.cpp', color: 'var(--lisa)', path: '~/.ollama', coming: !hasEntries(data.local) && !data.local?.scanError, scanError: data.local?.scanError },
    { id: 'cloud', glyph: '✦', name: 'Cloud-APIs', sub: 'OpenAI · Anthropic · Gemini', color: 'var(--sage)', path: 'API', coming: !hasEntries(data.cloud) && !data.cloud?.scanError, scanError: data.cloud?.scanError }
  ]
  const knownIds = new Set(known.map((l) => l.id))
  const extras: LlmDef[] = Object.keys(data)
    .filter((id) => !knownIds.has(id))
    .map((id) => ({ id, glyph: '◆', name: id, sub: 'Nutzerdefiniert', color: 'var(--amber)', path: id, coming: !hasEntries(data[id]) && !data[id]?.scanError, scanError: data[id]?.scanError }))
  return [...known, ...extras]
}

// Snapshot: Live-Stand mit zur Laufzeit gebildetem Datum (de-DE), nicht frozen.
function buildSnapshot(): Snapshot {
  let date = ''
  try {
    date = new Date().toLocaleString('de-DE')
  } catch {
    date = ''
  }
  return { frozen: false, date, label: 'live' }
}

// Maschinen: ein realer lokaler Eintrag (diese lokale Session). Label wird aus
// dem Hostnamen abgeleitet (generischer Fallback, wenn nicht ermittelbar).
function buildMachines(): Machine[] {
  let label = 'Dieser PC'
  try {
    const host = os.hostname().trim()
    if (host) label = host
  } catch {
    label = 'Dieser PC'
  }
  return [{ id: 'local', label, role: 'Lokal', path: '~/.claude', active: true }]
}

// Aggregiert alle Scanner zu AppData. Selbst klein gehalten; jede Teilaufgabe
// hat eine eigene, gekapselte Hilfsfunktion.
export function scanAll(): AppData {
  const data = buildData()
  try {
    findDuplicates(data)
  } catch (err) {
    console.error('[scan:dedupe]', err instanceof Error ? err.message : 'dedupe-error')
  }
  // Spiegelungs-Matrix (Cross-Tool-Abdeckung) — nur auf der shared-Familie.
  // buildCoverage kapselt eigene Fehler (try/catch -> []); fehlendes Feld laesst
  // den Renderer unveraendert.
  try {
    if (data.shared) data.shared.coverage = buildCoverage(data)
  } catch (err) {
    console.error('[scan:coverage]', err instanceof Error ? err.message : 'coverage-error')
  }
  data.audit = buildAuditConfig()
  return {
    snapshot: buildSnapshot(),
    machines: buildMachines(),
    llms: buildLlms(data),
    data
  }
}
