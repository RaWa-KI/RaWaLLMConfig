// System-Umgebung + Toolchain-Watcher (read-only). Quellen zur Laufzeit:
//   <shared>/docs/01-referenz/SYSTEM-ENVIRONMENT.md + system-environment/*-hub
//   <shared>/coordination/registry/localhost-ports.json (Ports = kein Secret)
//   <shared>/coordination/tracking/toolchain-daemon-state.json
//   <shared>/docs/01-referenz/*-changelog/**
// Secrets werden NIE gelesen — env nur als Bereichs-/Namen-Hinweis, keine Werte.
//
// WP-7 Pfad-Fix (Auflagen A5/A6): alle vier Pfade kamen frueher aus
// <shared>/.claude/** und existierten dort nicht. Sie werden jetzt zentral in
// shared-data-roots.ts per `dirname(configRoots().sharedClaude)` abgeleitet —
// kein neuer ConfigRootKey, Sandbox-Modus bleibt automatisch korrekt.
import fs from 'node:fs'
import path from 'node:path'
import type {
  System, SystemArea, Watcher,
  EntryStatus, UpdateChannel
} from '@shared/contract'
import { scanWatcherLive, scanWatcherStatic } from './watcher-live'
import { scanMcp, mcpNames } from './mcp-scan'
import { getVersionResultsCached, type VersionResultExecFn } from '../services/cli-version-cache'
import type { ToolSpec, ToolVersionResult } from '../services/cli-version-live'
import { liveErrorText } from '../services/cli-version-live'
import { scanHardwareArea } from './hardware-scan'
import { applyWatcherPlatformCopy, sysScanPlatformCopy } from './sys-scan-platform-copy'
import { sharedDataRoots } from './shared-data-roots'
import { newestChangelogDate } from './changelog-feed'

const dataRoots = sharedDataRoots()
const configuredSharedDir = dataRoots?.sharedDir ?? null
const refDir = dataRoots?.referencesDir ?? ''
const portsFile = path.join(dataRoots?.registryDir ?? '', 'localhost-ports.json')

// ── Helfer ──────────────────────────────────────────────────────────────
function readText(p: string): string {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function readJson<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T } catch { return null }
}

// „updated"-Datum aus dem SYSTEM-ENVIRONMENT-Frontmatter (A6: liegt real unter
// <shared>/docs/01-referenz/). Kein hardcodiertes Kalenderdatum mehr: fehlt die
// Datei, faellt der Stand auf das juengste real abgelegte Changelog-Datum und
// sonst auf '—' zurueck — nie auf ein erfundenes Datum.
function refUpdated(): string {
  try {
    const txt = readText(path.join(refDir, 'SYSTEM-ENVIRONMENT.md'))
    const m = txt.match(/updated:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)
    if (m) return m[1]
  } catch (e) {
    console.error('[scan:sys]', 'refUpdated failed')
  }
  return newestChangelogDate(refDir) ?? '—'
}

// Ports-/Registry-Areas und die lokale LLM-Reconciliation liegen in
// sys-scan-ports.ts (HR27-Split, WP2 2026-07-28).
import { localLlmArea, dbArea, type PortsDoc } from './sys-scan-ports'

// MCP-Area aus echten mcp-scan-Daten (Namen + Transport, keine Secret-Werte). KEIN
// Prototyp-Hardcode mehr: leeres mcp-scan-Ergebnis -> leere Area (graceful), nie Platzhalter.
function mcpArea(mcp: ReturnType<typeof scanMcp>): SystemArea {
  const names = new Set<string>([
    ...mcpNames(mcp.claude),
    ...mcpNames(mcp.codex),
    ...mcpNames(mcp.shared)
  ])
  const entries = [...names].sort().map((n) => ({
    id: `mcp-${n}`, name: n, status: 'active' as EntryStatus,
    desc: 'MCP-Server — Detail siehe MCP-Sektion.'
  }))
  return { id: 'mcp', label: 'MCP-Integrationen', icon: 'plug', blurb: 'Cloud + lokale MCP-Server.', entries }
}

// OLLAMA_* live pruefen (nur Namen, D008): gesetzte Variablen heissen
// „Ollama aktiv" — kein statischer Snapshot-Eintrag mehr. Der alte Hardcode
// („wirkungslos, Ollama entfernt", Stand 2026-06-07) war ein Falschpositiv:
// Ollama laeuft, die Modelle liegen im konfigurierten lokalen Modellordner
// (Befund 2026-07-19: OLLAMA_MODELS u.a. gesetzt, Modell-Unterordner vorhanden).
export function ollamaEnvEntry(): SystemArea['entries'][number] | null {
  const count = Object.keys(process.env).filter((key) => key.startsWith('OLLAMA')).length
  if (count === 0) return null
  return { id: 'ollama', name: 'OLLAMA_*', status: 'active', v: 'gesetzt', desc: `${count} OLLAMA_*-Variablen gesetzt — Ollama aktiv, Modelle im konfigurierten lokalen Modellordner.` }
}

// Env nur NAMEN (D008) — keine Werte, kein Read von .env/secrets.
function envArea(): SystemArea {
  const ollama = ollamaEnvEntry()
  return {
    id: 'env', label: 'Env-Variablen', icon: 'key', blurb: 'Nur Namen — nie Werte (D008).',
    entries: [
      { id: 'creds', name: 'Credentials', status: 'active', v: 'User-Env', desc: 'Alle Secrets ueber User-Env-Variablen · nie in Dateien.' },
      { id: 'pnpm', name: 'PNPM_HOME', status: 'active', v: 'gesetzt', desc: 'pnpm-Shim im PATH.' },
      ...(ollama ? [ollama] : [])
    ]
  }
}

// Statisch gehaltene Angaben klar als NICHT live kennzeichnen, damit das UI nie
// suggeriert, die Werte seien gerade erfasst worden. Bewusst ohne Kalenderdatum:
// ein hartcodierter Stichtag altert still und behauptet Aktualitaet (WP-7).
const STATIC_STAND = 'statische Liste — nicht live erfasst'
function stampStatic(areas: SystemArea[]): SystemArea[] {
  return areas.map((a) => ({ ...a, blurb: `${a.blurb} · ${STATIC_STAND}` }))
}

// Live-Version je Laufzeit/CLI per `<bin> --version` (bin/args hardcodiert, kein Secret).
const VERSION_SPECS: ToolSpec[] = [
  { id: 'node', bin: 'node', args: ['--version'] },
  { id: 'pnpm', bin: 'pnpm', args: ['--version'] },
  { id: 'python', bin: 'python', args: ['--version'] },
  { id: 'php', bin: 'php', args: ['--version'] },
  { id: 'git', bin: 'git', args: ['--version'] },
  { id: 'claude', bin: 'claude', args: ['--version'] },
  { id: 'codex', bin: 'codex', args: ['--version'] }
]

// Baut einen Laufzeit-/CLI-Eintrag aus dem Live-Ergebnis. Erfolg -> 'active'
// mit Version; Fehler -> 'unknown' („nicht pruefbar") mit Grund in desc/fields.
// 'stale' („veraltet") wird hier NIE gesetzt — dafuer gaebe es keinen Beleg.
// Exportiert fuer Unit-Tests (status-unknown-semantics.spec.ts).
export function versionEntry(
  id: string, name: string, baseDesc: string,
  res: ToolVersionResult | undefined, channel: UpdateChannel
): SystemArea['entries'][number] {
  if (res?.version) {
    return { id, name, status: 'active', v: res.version, desc: baseDesc, channel }
  }
  const reason = liveErrorText(res?.error ?? null)
  return {
    id, name, status: 'unknown' as EntryStatus, v: '—', channel,
    desc: `${baseDesc} · nicht pruefbar: ${reason}`,
    fields: { 'Pruefung': `nicht pruefbar — ${reason}` }
  }
}

// Live-Versions-Areas (Laufzeiten + CLI-Tools): `v` wird LIVE erfasst; bei
// Spawn-Fehler Status 'unknown' statt des frueheren Falsch-„veraltet" (WP-F4F9).
// Diese Areas werden NICHT per stampStatic datiert — sonst wuerde das UI live
// erfasste Werte als statischen Snapshot etikettieren (= Luege). Async via
// Prozess-Cache (PERF-HOCH-01): Spawns laufen non-blocking und nur einmal pro
// App-Lauf. execFn injizierbar (Tests ohne echte Spawns).
async function liveVersionAreas(
  platform: NodeJS.Platform = process.platform,
  execFn?: VersionResultExecFn
): Promise<SystemArea[]> {
  const live = await getVersionResultsCached(VERSION_SPECS, execFn)
  const copy = sysScanPlatformCopy(platform)
  const e = (id: string, name: string, desc: string): SystemArea['entries'][number] =>
    versionEntry(id, name, desc, live[id], 'cli')
  return [
    { id: 'runtimes', label: 'Laufzeiten', icon: 'box', blurb: 'Node, Python, PHP, Git (live).', entries: [
      e('node', 'Node.js', 'engines: >=22 in Projekten'),
      e('pnpm', 'pnpm', 'Bevorzugter Manager — NIEMALS npm/yarn'),
      e('python', 'Python', 'Haupt · separate Version fuer Open WebUI moeglich'),
      e('php', 'PHP', 'CLI'),
      e('git', 'Git', 'LFS + Longpaths aktiviert')
    ] },
    { id: 'cli', label: 'CLI-Tools', icon: 'term', blurb: 'Standalone-Installationen, Version live.', entries: [
      e('claude', 'Claude Code', copy.claudeDescription),
      e('codex', 'Codex CLI', 'Native Installer · OpenAI/Codex · Auto-Update')
    ] }
  ]
}

// Statische Iststand-Areas OHNE Versionswerte und OHNE Owner-Realdaten.
// Bewusst leer/neutral: Hosting-Domains und Workspace-Namen sind
// umgebungsspezifisch und werden nicht hartkodiert. Hardware wird live
// lokal erfasst (hardware-scan.ts); die dynamischen Versions-Areas
// (liveVersionAreas) liefern die realen Laufzeit-/CLI-Werte.
function staticAreas(): SystemArea[] {
  return stampStatic([
    { id: 'editors', label: 'Editor-Extensions', icon: 'edit', blurb: 'VS Code AI/Coding-Extensions.', entries: [
      { id: 'cc-ext', name: 'anthropic.claude-code', status: 'active', desc: 'Claude Code Extension', channel: 'extension' as UpdateChannel },
      { id: 'gpt-ext', name: 'openai.chatgpt', status: 'active', desc: 'ChatGPT Extension · Computer-Use GA', channel: 'extension' as UpdateChannel },
      { id: 'cline', name: 'saoudrizwan.claude-dev', status: 'active', desc: 'Claude Dev (Cline)', channel: 'extension' as UpdateChannel }
    ] },
    { id: 'hosting', label: 'Hosting & Domains', icon: 'globe', blurb: 'Hosting & Domains (umgebungsspezifisch).', entries: [] },
    { id: 'workspaces', label: 'Workspaces', icon: 'layers', blurb: 'WSs mit Kuerzeln & Stacks (umgebungsspezifisch).', entries: [] }
  ])
}

export async function scanSystem(
  platform: NodeJS.Platform = process.platform,
  execFn?: VersionResultExecFn
): Promise<System> {
  if (!configuredSharedDir) return {
    updated: '—',
    areas: [{ id: 'configuration', label: 'Konfiguration', icon: 'warning', blurb: 'Ein Ordner muss eingerichtet werden.', entries: [{ id: 'shared-root-not-configured', name: 'Shared-Ordner nicht eingerichtet', status: 'stale', desc: 'Nicht konfiguriert — bitte in Einstellungen einen Shared-Ordner waehlen.' }] }]
  }
  try {
    const doc = readJson<PortsDoc>(portsFile)
    const mcp = scanMcp()
    // UI-Reihenfolge erhalten: hardware, [runtimes, cli (live)], editors, hosting, workspaces.
    const hardware = await scanHardwareArea()
    const stat = staticAreas()
    const live = await liveVersionAreas(platform, execFn)
    const areas = [hardware, ...live, ...stat, localLlmArea(doc), mcpArea(mcp), dbArea(doc), envArea()]
    return { updated: refUpdated(), areas }
  } catch (e) {
    console.error('[scan:sys]', 'scanSystem failed')
    return { updated: '—', areas: [] }
  }
}

// ── Watcher ─────────────────────────────────────────────────────────────
// Der statische Fallback (Datei-Stand aus toolchain-daemon-state.json, mit
// detected_at datiert) liegt seit WP-F4F9 in watcher-live.ts (HR27-Split) —
// scanWatcherStatic wird von dort re-importiert (siehe Import oben).

export interface WatcherScanSources {
  live: () => Promise<Watcher>
  fallback: () => Watcher
}

// scanWatcher (Welle-3-INT): bevorzugt LIVE-Daten aus watcher-live (Scope-B:
// tracking/toolchain-daemon-state + references/*-changelog, Secret-Guard je Read).
// Fallback auf den statischen Stand (sync), wenn live keine Quellen liefert.
// Async (PERF-HOCH-01): Versions-Spawns blockieren den Main-Loop nicht mehr.
export async function scanWatcher(
  platform: NodeJS.Platform = process.platform,
  readers: WatcherScanSources = { live: scanWatcherLive, fallback: scanWatcherStatic }
): Promise<Watcher> {
  try {
    const live = await readers.live()
    const watcher = live.sources.length > 0 ? live : readers.fallback()
    return applyWatcherPlatformCopy(watcher, platform)
  } catch (e) {
    console.error('[scan:watcher]', 'scanWatcher failed')
    return {
      daemon: { status: 'Unknown', lastResult: '—', schedule: '—', tokens: '—', sources: 0, updated: '—', note: 'Watcher-State nicht lesbar.' },
      tiers: [], sources: [], changelogs: []
    }
  }
}
