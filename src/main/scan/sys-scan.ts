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
  System, SystemArea, Watcher, WatcherSource,
  EntryStatus, SourceState
} from '@shared/contract'
import { scanWatcherLive } from './watcher-live'
import { scanMcp, mcpNames } from './mcp-scan'
import { getVersionsCached } from '../services/cli-version-cache'
import type { ToolSpec } from '../services/cli-version-live'
import { scanHardwareArea } from './hardware-scan'
import { applyWatcherPlatformCopy, sysScanPlatformCopy } from './sys-scan-platform-copy'
import { sharedDataRoots } from './shared-data-roots'
import { changelogFeed, newestChangelogDate } from './changelog-feed'

const dataRoots = sharedDataRoots()
const configuredSharedDir = dataRoots?.sharedDir ?? null
const refDir = dataRoots?.referencesDir ?? ''
const trackDir = dataRoots?.trackingDir ?? ''
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
  } catch {
    console.error('[scan:sys]', 'refUpdated failed')
  }
  return newestChangelogDate(refDir) ?? '—'
}

// Ports nach Status klassifizieren — active/reserved -> active, stale -> stale, conflict-risk -> conflict.
function portStatus(s: string | undefined): EntryStatus {
  if (s === 'active') return 'active'
  if (s === 'conflict-risk' || s === 'conflict') return 'conflict'
  if (s === 'stale') return 'stale'
  return 'active'
}

// ── Areas aus localhost-ports.json (real, kein Secret) ──────────────────
interface PortRow { port?: number; protocol?: string; service?: string; host?: string; status?: string; ws?: string }
interface PortsDoc { ports?: Record<string, PortRow> }

function pickPorts(doc: PortsDoc | null, match: RegExp): SystemArea['entries'] {
  if (!doc?.ports) return []
  return Object.entries(doc.ports)
    .filter(([id, r]) => match.test(id) || match.test(r.service ?? ''))
    .map(([id, r]) => ({
      id,
      name: r.service ?? id,
      status: portStatus(r.status),
      v: r.port != null ? `:${r.port}` : '—',
      desc: `${r.protocol ?? 'http'} · ${r.host ?? '127.0.0.1'} · ${r.status ?? 'reserved'}`,
      fields: { Port: String(r.port ?? '—'), Host: r.host ?? '127.0.0.1', Status: r.status ?? 'reserved' }
    }))
}

function localLlmArea(doc: PortsDoc | null): SystemArea {
  const entries = pickPorts(doc, /llama|ollama|brain|searxng|local/i)
  return { id: 'localllm', label: 'Lokale LLM', icon: 'sparkle', blurb: 'llama-server, Brain-Adapter, GGUF.', entries }
}

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

function dbArea(doc: PortsDoc | null): SystemArea {
  const entries = pickPorts(doc, /mariadb|mysql|neo4j/i)
  return { id: 'databases', label: 'Datenbanken', icon: 'db', blurb: 'MariaDB, MySQL, Neo4j.', entries }
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

// Live-Versions-Areas (Laufzeiten + CLI-Tools): `v` wird LIVE erfasst, Fallback auf
// den bisherigen Snapshot-Wert wenn live null. Diese Areas werden NICHT per
// stampStatic datiert — sonst wuerde das UI live erfasste Werte als statischen
// Snapshot etikettieren (= Luege). Async via Prozess-Cache (PERF-HOCH-01):
// Spawns laufen non-blocking und nur einmal pro App-Lauf.
async function liveVersionAreas(platform: NodeJS.Platform = process.platform): Promise<SystemArea[]> {
  const live = await getVersionsCached(VERSION_SPECS)
  // Kein Versions-Hardcode als Fallback mehr: nicht erfasst -> '—' und Status
  // 'stale'. Eine gecachte Wunschversion anzuzeigen waere erfundene Realitaet.
  const v = (id: string): string => live[id] ?? '—'
  const st = (id: string): EntryStatus => (live[id] ? 'active' : 'stale')
  const copy = sysScanPlatformCopy(platform)
  return [
    { id: 'runtimes', label: 'Laufzeiten', icon: 'box', blurb: 'Node, Python, PHP, Git (live).', entries: [
      { id: 'node', name: 'Node.js', status: st('node'), v: v('node'), desc: 'engines: >=22 in Projekten' },
      { id: 'pnpm', name: 'pnpm', status: st('pnpm'), v: v('pnpm'), desc: 'Bevorzugter Manager — NIEMALS npm/yarn' },
      { id: 'python', name: 'Python', status: st('python'), v: v('python'), desc: 'Haupt · separate Version fuer Open WebUI moeglich' },
      { id: 'php', name: 'PHP', status: st('php'), v: v('php'), desc: 'CLI' },
      { id: 'git', name: 'Git', status: st('git'), v: v('git'), desc: 'LFS + Longpaths aktiviert' }
    ] },
    { id: 'cli', label: 'CLI-Tools', icon: 'term', blurb: 'Standalone-Installationen, Version live.', entries: [
      { id: 'claude', name: 'Claude Code', status: st('claude'), v: v('claude'), desc: copy.claudeDescription },
      { id: 'codex', name: 'Codex CLI', status: st('codex'), v: v('codex'), desc: 'Native Installer · OpenAI/Codex · Auto-Update' }
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
      { id: 'cc-ext', name: 'anthropic.claude-code', status: 'active', desc: 'Claude Code Extension' },
      { id: 'gpt-ext', name: 'openai.chatgpt', status: 'active', desc: 'ChatGPT Extension · Computer-Use GA' },
      { id: 'cline', name: 'saoudrizwan.claude-dev', status: 'active', desc: 'Claude Dev (Cline)' }
    ] },
    { id: 'hosting', label: 'Hosting & Domains', icon: 'globe', blurb: 'Hosting & Domains (umgebungsspezifisch).', entries: [] },
    { id: 'workspaces', label: 'Workspaces', icon: 'layers', blurb: 'WSs mit Kuerzeln & Stacks (umgebungsspezifisch).', entries: [] }
  ])
}

export async function scanSystem(platform: NodeJS.Platform = process.platform): Promise<System> {
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
    const live = await liveVersionAreas(platform)
    const areas = [hardware, ...live, ...stat, localLlmArea(doc), mcpArea(mcp), dbArea(doc), envArea()]
    return { updated: refUpdated(), areas }
  } catch (e) {
    console.error('[scan:sys]', 'scanSystem failed')
    return { updated: '—', areas: [] }
  }
}

// ── Watcher ─────────────────────────────────────────────────────────────
interface DaemonState { [k: string]: { remote_latest?: string; local_version?: string } | unknown }

function sourceState(local?: string, latest?: string): SourceState {
  if (local && latest && local === latest) return 'current'
  if (local && latest && local !== latest) return 'update'
  return 'recent'
}

// Quellen NUR aus dem realen Daemon-State. Der frueher hier stehende Hardcode
// (Claude 2.1.165 / Codex 0.137.0 „current") hat bei fehlendem State einen
// Versionsgleichstand behauptet, den niemand geprueft hatte — ersatzlos raus:
// keine Quelle -> leere Liste -> ehrlicher Empty-State im UI.
function watcherSources(state: DaemonState | null): WatcherSource[] {
  const out: WatcherSource[] = []
  const cli = (id: string, name: string): void => {
    const s = state?.[id] as { remote_latest?: string; local_version?: string } | undefined
    if (!s) return
    out.push({ name, kind: 'CLI', current: s.local_version ?? '—', latest: s.remote_latest ?? '—', tier: 1, state: sourceState(s.local_version, s.remote_latest) })
  }
  cli('claude-cli', 'Claude Code CLI')
  cli('codex-cli', 'Codex CLI')
  return out
}

// Statischer Fallback (Welle-3-INT): die fruehere inline scanWatcher-Logik. Wird
// nur genutzt, wenn watcher-live keine Quellen liefert (Scope-B fehlt/leer).
// Liefert ausschliesslich real Gelesenes — bei leerer Quelle bleibt die Sektion
// bewusst leer statt einen erfundenen Stand zu zeigen. Read-only, kein Secret.
function scanWatcherStatic(): Watcher {
  const state = readJson<DaemonState>(path.join(trackDir, 'toolchain-daemon-state.json'))
  const sources = watcherSources(state)
  const tiers: Watcher['tiers'] = [
    { id: 1, label: 'Stufe 1', mode: 'auto-erfassen', cls: 'active', desc: 'Automatisch erfasst & signalisiert (read-only).' },
    { id: 2, label: 'Stufe 2', mode: 'gated', cls: 'stale', desc: 'Owner-Freigabe noetig · Flag mit tool+version+timestamp.' },
    { id: 3, label: 'Stufe 3', mode: 'flag-only', cls: 'dup', desc: 'Nur markiert, keine automatische Aktion.' }
  ]
  const daemon: Watcher['daemon'] = {
    status: state ? 'Ready' : 'Unknown',
    lastResult: state ? '0' : '—',
    schedule: 'Task-Scheduler (run-hidden)',
    tokens: '0 Daemon-LLM-Token', sources: sources.length, updated: refUpdated(),
    note: 'Deterministische Erkennung von Tool-/Modell-Updates; legt Changelog-Volltexte lokal ab.'
  }
  // Changelog-Feed aus dem realen Bestand: dynamisches Scannen aller
  // `*-changelog`-Ordner, beide Namensschemata, ordneruebergreifend die
  // juengsten Eintraege. Kein Platzhalter mehr bei leerer Quelle.
  return { daemon, tiers, sources, changelogs: changelogFeed(refDir) }
}

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
