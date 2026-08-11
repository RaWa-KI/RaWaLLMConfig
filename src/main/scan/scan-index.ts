// scan-index.ts — Aggregator (read-only). Verdrahtet alle Familien-Scanner zu
// AppData. Phase 1: LIEST nur das Dateisystem (zur Laufzeit via Familien-Scanner),
// schreibt/aendert NIE Config. Secrets werden nie getragen — die Scanner liefern
// nur Namen/Status/Pfade/Metadaten. Jeder Scanner ist einzeln gekapselt: faellt
// einer aus, bleibt seine Familie leer und der Rest der App lebt weiter.
import os from 'node:os'
import type { AppData, LlmConfig, LlmDef, Machine, Snapshot } from '@shared/contract'
import { scanMcp } from './mcp-scan'
import { markMcpConflicts } from './mcp-conflicts'
import { scanRegistry, scanRegistryAsync } from './engine/build-data'
import { isProviderScanEnabled } from './integration-filter'
import { buildAuditConfig, buildAuditConfigAsync } from './scan-audit-categories'
import { findDuplicates } from '../services/dedupe'
import { findContentDuplicates } from '../services/dedupe-content-scan'
import { findDriftRelations } from '../services/drift-relation'
import { buildCoverage } from '../services/coverage'
// HR27-Split: die userglobal-Ableitung (inkl. Kimi-Quelle) liegt in scan-userglobal.
import { buildUserglobal } from './scan-userglobal'
import { coverageEntryKey, createCoverageAckStore } from '../services/coverage-ack-store'
import { yieldToEventLoop } from '../lib/yield-loop'

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
// Owner-Punkt 7 (praegediert 2026-07-27): Divergenz zwischen Plugin-Scan-Sicht
// (Ordner) und MCP-Merge-Sicht (JSON-Server) markiert nur noch die Ordner-
// Richtung als Konflikt (Ordner mit MCP-Deklaration ohne Registereintrag).
// Register-Eintraege ohne Ordner sind Dokulage-Normalfall (npx/URL) und werden
// als aktive Eintraege uebernommen, nicht mehr als Konflikt.
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

  // Konflikt-Erkennung (Richtung Ordner→Register): ein Ordner-Eintrag mit
  // MCP-Deklaration, der NICHT im MCP-Register steht, erhaelt status:'conflict'.
  // Umgekehrt sind Register-Eintraege ohne Ordner legitim (Dokulage 2026-07-27)
  // und fliessen als aktive Eintraege ein — kein Konflikt.
  // FIX 2: existing (reiche scanDir-Kategorie) als Basis behalten; MCP-Eintraege
  // nur additiv/konflikt-markiert einmischen — kein Ersetzen durch mcpCat als Basis.
  const mergedCat = markMcpConflicts(cat, existing)
  // scan-03: buildCategory setzt immer id:'plugins'; kein Plugin-Ordner (existing=null)
  // liefert mcpCat direkt zurueck — familien-spezifische ID muss nachgezogen werden.
  mergedCat.id = pluginsId

  if (existingIdx >= 0) {
    cfg.categories.splice(existingIdx, 1, mergedCat)
  } else {
    cfg.categories.push(mergedCat)
  }
}

// data-Block bauen: alle Familien ueber die Provider-Registry scannen
// (scanRegistry: shared, claude, codex, local — inkl. llm-comingSoon-Frueh-Return
// und je Familie durchgereichten diffLabels), dann MCP-Kategorien einmischen und
// userglobal ableiten. Reihenfolge unveraendert zum hartcodierten M1-Stand.
// mergeMcp/buildUserglobal sind additiv exportiert (B-5: Build-Data-Equivalence-
// Spec konstruiert daraus die legacyBuildData()-Referenz) — Logik unveraendert.
function buildData(): Record<string, LlmConfig> {
  return enrichData(scanRegistry())
}

// Gemeinsame Nachbereitung (MCP-Merge, userglobal, Coverage-Acks) fuer den
// synchronen und den gechunkten Async-Pfad — identische Reihenfolge/Ergebnisse.
function enrichData(data: Record<string, LlmConfig>): Record<string, LlmConfig> {
  try {
    const mcp = scanMcp()
    mergeMcp(data.claude, mcp, 'claude')
    mergeMcp(data.codex, mcp, 'codex')
    if (isProviderScanEnabled('shared')) mergeMcp(data.shared, mcp, 'shared')
  } catch (err) {
    console.error('[scan:mcp]', err instanceof Error ? err.message : 'scan-error')
  }
  data.userglobal = buildUserglobal(data)
  applyCoverageAcks(data, new Set(createCoverageAckStore().readKeys()))
  return data
}

// Async-Variante (Teilplan B): scanRegistryAsync yielded zwischen den Familien;
// zwischen den schweren Phasen (MCP-Merge, Dedupe/Coverage) wird ebenfalls
// abgegeben, damit der Main-Event-Loop IPC zwischenschlachten kann.
async function buildDataAsync(): Promise<Record<string, LlmConfig>> {
  const data = await scanRegistryAsync()
  await yieldToEventLoop()
  return enrichData(data)
}

export function applyCoverageAcks(data: Record<string, LlmConfig>, acknowledged: ReadonlySet<string>): void {
  for (const [familyId, family] of Object.entries(data)) {
    for (const category of family.categories) {
      for (const entry of category.entries) {
        const key = coverageEntryKey(familyId, category.id, entry.id)
        if (entry.status === 'conflict' && acknowledged.has(key)) entry.status = 'acknowledged'
      }
    }
  }
}

// B-5: additive Exporte fuer den Build-Data-Equivalence-Spec. mergeMcp +
// buildUserglobal + buildData werden im Test gegen eine legacyBuildData()-Referenz
// (direkte Alt-Scanner-Aufrufe) deep-equal verglichen. NUR Sichtbarmachung —
// KEINE Logikaenderung. scanMcp wird im Test direkt aus mcp-scan importiert.
// Knip sieht require()-Nutzung in Specs nicht — ignoreIssues in .knip.json.
export { mergeMcp, buildUserglobal, buildData, buildLlms }

function hasEntries(cfg: LlmConfig | undefined): boolean {
  return !!cfg && cfg.categories.some((c) => c.entries.length > 0)
}

// Sichtbarkeit haengt allein an der Familien-Config (Eintraege oder Scan-Fehler);
// der LlmDef selbst spielt keine Rolle (frueherer ungenutzter Parameter entfernt).
function visible(cfg: LlmConfig | undefined): boolean {
  return hasEntries(cfg) || !!cfg?.scanError
}

function buildLlms(data: Record<string, LlmConfig>): LlmDef[] {
  const known: LlmDef[] = [
    { id: 'shared', glyph: '⊕', name: 'Shared', sub: 'Cross-Workspace', color: 'var(--sage)', path: '.shared', scanError: data.shared?.scanError },
    { id: 'userglobal', glyph: '◎', name: 'Userglobal', sub: '~/.claude + ~/.codex + ~/.kimi-code', color: 'var(--amber)', path: '~', scanError: data.userglobal?.scanError },
    { id: 'claude', glyph: '✳', name: 'Claude', sub: 'Anthropic', color: 'var(--terra)', path: '~/.claude', scanError: data.claude?.scanError },
    { id: 'codex', glyph: '◇', name: 'Codex', sub: 'OpenAI', color: 'var(--papa)', path: '~/.codex', scanError: data.codex?.scanError },
    // HR16-Paritaet: dritter nativer Loader mit eigener Familie (~/.kimi-code).
    { id: 'kimi', glyph: '◈', name: 'Kimi', sub: 'Moonshot', color: 'var(--sage)', path: '~/.kimi-code', scanError: data.kimi?.scanError },
    // HR16-Paritaet: vierter nativer Loader mit eigener Familie (~/.grok).
    { id: 'grok', glyph: '◉', name: 'Grok', sub: 'xAI', color: 'var(--terra)', path: '~/.grok', scanError: data.grok?.scanError },
    { id: 'local', glyph: '▢', name: 'Lokal', sub: 'llama.cpp', color: 'var(--lisa)', path: '~/.ollama', scanError: data.local?.scanError },
    { id: 'cloud', glyph: '✦', name: 'Cloud-APIs', sub: 'OpenAI · Anthropic · Gemini', color: 'var(--sage)', path: 'API', scanError: data.cloud?.scanError }
  ].filter((def) => visible(data[def.id]))
  const knownIds = new Set(known.map((l) => l.id))
  const extras: LlmDef[] = Object.keys(data)
    // audit = Register-only (Masterplan Teil E): Daten bleiben, kein Familien-Tab.
    .filter((id) => !knownIds.has(id) && id !== 'audit')
    .filter((id) => visible(data[id]))
    .map((id) => ({ id, glyph: '◆', name: id, sub: 'Nutzerdefiniert', color: 'var(--amber)', path: id, scanError: data[id]?.scanError }))
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
    // Plan C: inhaltsbasierte Dubletten (Groesse+SHA-256), unabhaengig von
    // Namen/Flach-Scan/Merge — haengt an die Namens-Erkennung an.
    findContentDuplicates(data)
  } catch (err) {
    console.error('[scan:dedupe]', err instanceof Error ? err.message : 'dedupe-error')
  }
  findDriftRelations(data)
  // Spiegelungs-Matrix (Cross-Tool-Abdeckung) — nur auf der shared-Familie.
  // buildCoverage kapselt eigene Fehler (try/catch -> []); fehlendes Feld laesst
  // den Renderer unveraendert.
  try {
    if (data.shared) data.shared.coverage = buildCoverage(data)
  } catch (err) {
    console.error('[scan:coverage]', err instanceof Error ? err.message : 'coverage-error')
  }
  data.audit = buildAuditConfig()
  return { snapshot: buildSnapshot(), machines: buildMachines(), llms: buildLlms(data), data }
}

// Gechunkte Async-Variante (Teilplan B): gleiche Aggregation wie scanAll, aber
// mit Event-Loop-Yields zwischen Familien-Scans und Nachbereitungs-Phasen.
// Der Main-Prozess bleibt dadurch waehrend des kalten Vollscans IPC-antwortfaehig
// (Onboarding-Gate, readWatcher, Quellen) — kein Worker noetig (Profil: ~0,6–1,7 s
// Scan, kein dauerhafter Mehr-Sekunden-Stall nach Chunking). Wird vom Default-
// Config-Scan-Cache verwendet; scanAll bleibt fuer Sync-Tests/Equivalence erhalten.
export async function scanAllAsync(): Promise<AppData> {
  const data = await buildDataAsync()
  await yieldToEventLoop()
  try {
    findDuplicates(data)
    findContentDuplicates(data)
  } catch (err) {
    console.error('[scan:dedupe]', err instanceof Error ? err.message : 'dedupe-error')
  }
  findDriftRelations(data)
  await yieldToEventLoop()
  try {
    if (data.shared) data.shared.coverage = buildCoverage(data)
  } catch (err) {
    console.error('[scan:coverage]', err instanceof Error ? err.message : 'coverage-error')
  }
  await yieldToEventLoop()
  data.audit = await buildAuditConfigAsync()
  return { snapshot: buildSnapshot(), machines: buildMachines(), llms: buildLlms(data), data }
}
