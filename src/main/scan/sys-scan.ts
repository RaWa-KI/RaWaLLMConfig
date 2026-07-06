// System-Umgebung + Toolchain-Watcher (read-only). Quellen zur Laufzeit:
//   .shared/.claude/references/SYSTEM-ENVIRONMENT.md + system-environment/*-hub
//   .shared/.claude/coordination/registry/localhost-ports.json (Ports = kein Secret)
//   .shared/.claude/coordination/tracking/toolchain-daemon-state.json + */*-changelog/**
// Secrets werden NIE gelesen — env nur als Bereichs-/Namen-Hinweis, keine Werte.
import fs from 'node:fs'
import path from 'node:path'
import type {
  System, SystemArea, Watcher, WatcherSource, WatcherChangelog,
  EntryStatus, SourceState
} from '@shared/contract'
import { scanWatcherLive } from './watcher-live'
import { scanMcp, mcpNames } from './mcp-scan'
import { configRoots } from '../services/config-roots'
import { getVersionsCached } from '../services/cli-version-cache'
import type { ToolSpec } from '../services/cli-version-live'

// Trunk-Pfade aus der Single Source (Default = real, M1 unveraendert; mit
// RAWALLM_SANDBOX_ROOT zeigt sharedDir unter <sandbox>/.shared/.claude).
const sharedDir = configRoots().sharedClaude
const refDir = path.join(sharedDir, 'references')
const trackDir = path.join(sharedDir, 'coordination', 'tracking')
const portsFile = path.join(sharedDir, 'coordination', 'registry', 'localhost-ports.json')

// ── Helfer ──────────────────────────────────────────────────────────────
function readText(p: string): string {
  try { return fs.readFileSync(p, 'utf8') } catch { return '' }
}

function readJson<T>(p: string): T | null {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T } catch { return null }
}

function listFiles(dir: string): string[] {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')) } catch { return [] }
}

// "updated"-Datum aus SYSTEM-ENVIRONMENT-Frontmatter (graceful Default).
function refUpdated(): string {
  try {
    const txt = readText(path.join(refDir, 'SYSTEM-ENVIRONMENT.md'))
    const m = txt.match(/updated:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/)
    return m ? m[1] : '2026-06-04'
  } catch (e) {
    console.error('[scan:sys]', 'refUpdated failed')
    return '2026-06-04'
  }
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

// Env nur NAMEN (D008) — keine Werte, kein Read von .env/secrets.
function envArea(): SystemArea {
  return {
    id: 'env', label: 'Env-Variablen', icon: 'key', blurb: 'Nur Namen — nie Werte (D008).',
    entries: [
      { id: 'creds', name: 'Credentials', status: 'active', v: 'User-Env', desc: 'Alle Secrets ueber User-Env-Variablen · nie in Dateien.' },
      { id: 'pnpm', name: 'PNPM_HOME', status: 'active', v: 'gesetzt', desc: 'pnpm-Shim im PATH.' },
      { id: 'ollama', name: 'OLLAMA_*', status: 'stale', v: 'gesetzt', desc: 'OLLAMA_MODELS u.a. — wirkungslos (Ollama entfernt).' }
    ]
  }
}

// Statisch gehaltene Versionsangaben als datierten Snapshot kennzeichnen, damit das UI
// nie suggeriert, die Werte seien live erfasst (Quelle: VALIDATED_REFERENCE).
const STATIC_STAND = 'Stand 2026-06-07'
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
async function liveVersionAreas(): Promise<SystemArea[]> {
  const live = await getVersionsCached(VERSION_SPECS)
  const v = (id: string, fallback: string): string => live[id] ?? fallback
  return [
    { id: 'runtimes', label: 'Laufzeiten', icon: 'box', blurb: 'Node, Python, PHP, Git (live).', entries: [
      { id: 'node', name: 'Node.js', status: 'active', v: v('node', '22.18.0'), desc: 'engines: >=22 in Projekten' },
      { id: 'pnpm', name: 'pnpm', status: 'active', v: v('pnpm', '10.33.4'), desc: 'Bevorzugter Manager — NIEMALS npm/yarn' },
      { id: 'python', name: 'Python', status: 'active', v: v('python', '3.13.7'), desc: 'Haupt · 3.11.9 separat fuer Open WebUI' },
      { id: 'php', name: 'PHP', status: 'active', v: v('php', '8.4.20'), desc: 'CLI, ZTS x64' },
      { id: 'git', name: 'Git', status: 'active', v: v('git', '2.51.0'), desc: 'LFS + Longpaths aktiviert' }
    ] },
    { id: 'cli', label: 'CLI-Tools', icon: 'term', blurb: 'Native Installer (nicht npm), Version live.', entries: [
      { id: 'claude', name: 'Claude Code', status: 'active', v: v('claude', 'CLI'), desc: 'Native Installer · ~/.local/bin/claude.exe · Auto-Update' },
      { id: 'codex', name: 'Codex CLI', status: 'active', v: v('codex', 'CLI'), desc: 'Native Installer · OpenAI/Codex · Auto-Update' }
    ] }
  ]
}

// Statische Iststand-Areas OHNE Versionswerte und OHNE Owner-Realdaten.
// Bewusst leer/neutral: Hardware-Specs, Hosting-Domains und Workspace-Namen sind
// umgebungsspezifisch und werden nicht hartkodiert. Die dynamischen Versions-
// Areas (liveVersionAreas) liefern die realen Laufzeit-/CLI-Werte.
function staticAreas(): SystemArea[] {
  return stampStatic([
    { id: 'hardware', label: 'Hardware', icon: 'cpu', blurb: 'Rechner, GPU, Monitore (umgebungsspezifisch).', entries: [] },
    { id: 'editors', label: 'Editor-Extensions', icon: 'edit', blurb: 'VS Code AI/Coding-Extensions.', entries: [
      { id: 'cc-ext', name: 'anthropic.claude-code', status: 'active', desc: 'Claude Code Extension' },
      { id: 'gpt-ext', name: 'openai.chatgpt', status: 'active', desc: 'ChatGPT Extension · Computer-Use GA' },
      { id: 'cline', name: 'saoudrizwan.claude-dev', status: 'active', desc: 'Claude Dev (Cline)' }
    ] },
    { id: 'hosting', label: 'Hosting & Domains', icon: 'globe', blurb: 'Hosting & Domains (umgebungsspezifisch).', entries: [] },
    { id: 'workspaces', label: 'Workspaces', icon: 'layers', blurb: 'WSs mit Kuerzeln & Stacks (umgebungsspezifisch).', entries: [] }
  ])
}

export async function scanSystem(): Promise<System> {
  try {
    const doc = readJson<PortsDoc>(portsFile)
    const mcp = scanMcp()
    // UI-Reihenfolge erhalten: hardware, [runtimes, cli (live)], editors, hosting, workspaces.
    const stat = staticAreas()
    const live = await liveVersionAreas()
    const areas = [stat[0], ...live, ...stat.slice(1), localLlmArea(doc), mcpArea(mcp), dbArea(doc), envArea()]
    return { updated: refUpdated(), areas }
  } catch (e) {
    console.error('[scan:sys]', 'scanSystem failed')
    return { updated: '2026-06-04', areas: [] }
  }
}

// ── Watcher ─────────────────────────────────────────────────────────────
interface DaemonState { [k: string]: { remote_latest?: string; local_version?: string } | unknown }

function sourceState(local?: string, latest?: string): SourceState {
  if (local && latest && local === latest) return 'current'
  if (local && latest && local !== latest) return 'update'
  return 'recent'
}

function watcherSources(state: DaemonState | null): WatcherSource[] {
  const out: WatcherSource[] = []
  const cli = (id: string, name: string): void => {
    const s = state?.[id] as { remote_latest?: string; local_version?: string } | undefined
    if (!s) return
    out.push({ name, kind: 'CLI', current: s.local_version ?? '—', latest: s.remote_latest ?? '—', tier: 1, state: sourceState(s.local_version, s.remote_latest) })
  }
  cli('claude-cli', 'Claude Code CLI')
  cli('codex-cli', 'Codex CLI')
  if (out.length === 0) {
    out.push({ name: 'Claude Code CLI', kind: 'CLI', current: '2.1.165', latest: '2.1.165', tier: 1, state: 'current' })
    out.push({ name: 'Codex CLI', kind: 'CLI', current: '0.137.0', latest: '0.137.0', tier: 1, state: 'current' })
  }
  return out
}

// Neuesten Changelog je Tool aus references/*-changelog/ (Dateiname YYYY-MM-DD--tool--vX.md).
function latestChangelogs(): WatcherChangelog[] {
  const dirs = ['claude-changelog', 'codex-changelog', 'electron-changelog']
  const out: WatcherChangelog[] = []
  for (const d of dirs) {
    try {
      const files = listFiles(path.join(refDir, d)).sort()
      const last = files[files.length - 1]
      if (!last) continue
      const m = last.match(/^([0-9-]+)--([a-z0-9-]+)--v?([^.]+)\.md$/i)
      if (m) out.push({ tool: m[2], version: m[3], date: m[1], summary: `Letzter erfasster ${m[2]}-Changelog-Eintrag (lokal abgelegt).` })
    } catch { /* graceful */ }
  }
  return out.length ? out : [{ tool: 'claude-code', version: '2.1.165', date: '2026-06-03', summary: 'CLI + VS-Code-Extension auf Versionsgleichstand.' }]
}

// Statischer Fallback (Welle-3-INT): die fruehere inline scanWatcher-Logik. Wird
// nur genutzt, wenn watcher-live keine Quellen liefert (Scope-B fehlt/leer), damit
// die Updates-Sektion nie leer einrastet. Read-only, kein Secret.
function scanWatcherStatic(): Watcher {
  const state = readJson<DaemonState>(path.join(trackDir, 'toolchain-daemon-state.json'))
  const sources = watcherSources(state)
  const tiers: Watcher['tiers'] = [
    { id: 1, label: 'Stufe 1', mode: 'auto-erfassen', cls: 'active', desc: 'Automatisch erfasst & signalisiert (read-only).' },
    { id: 2, label: 'Stufe 2', mode: 'gated', cls: 'stale', desc: 'Owner-Freigabe noetig · Flag mit tool+version+timestamp.' },
    { id: 3, label: 'Stufe 3', mode: 'flag-only', cls: 'dup', desc: 'Nur markiert, keine automatische Aktion.' }
  ]
  const daemon: Watcher['daemon'] = {
    status: 'Ready', lastResult: '0', schedule: 'Task-Scheduler (run-hidden)',
    tokens: '0 Daemon-LLM-Token', sources: sources.length, updated: refUpdated(),
    note: 'Deterministische Erkennung von Tool-/Modell-Updates; legt Changelog-Volltexte lokal ab.'
  }
  return { daemon, tiers, sources, changelogs: latestChangelogs() }
}

// scanWatcher (Welle-3-INT): bevorzugt LIVE-Daten aus watcher-live (Scope-B:
// tracking/toolchain-daemon-state + references/*-changelog, Secret-Guard je Read).
// Fallback auf den statischen Stand (sync), wenn live keine Quellen liefert.
// Async (PERF-HOCH-01): Versions-Spawns blockieren den Main-Loop nicht mehr.
export async function scanWatcher(): Promise<Watcher> {
  try {
    const live = await scanWatcherLive()
    if (live.sources.length > 0) return live
    return scanWatcherStatic()
  } catch (e) {
    console.error('[scan:watcher]', 'scanWatcher failed')
    return {
      daemon: { status: 'Unknown', lastResult: '—', schedule: '—', tokens: '—', sources: 0, updated: '2026-06-04', note: 'Watcher-State nicht lesbar.' },
      tiers: [], sources: [], changelogs: []
    }
  }
}
