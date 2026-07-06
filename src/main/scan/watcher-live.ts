// watcher-live.ts — liest Toolchain-Watcher-Daemon-State + Changelogs LIVE und
// liefert ein `Watcher`-Objekt (F4). Read-Scope STRIKT auf Scope-B (ZIELE §2.3):
//   - references/*-changelog  (gezogene Changelog-Volltexte, nur Metadaten genutzt)
//   - coordination/tracking   (toolchain-daemon-state.json)
// KEIN Volltext aus coordination/{security,signals,briefings} — nicht im Read-Set.
// Secret-Guard (`isSecretPathForRead`) ist JEDEM Read vorgeschaltet; secret-bearing
// Pfade werden uebersprungen. Pfade injizierbar (Default real, Test=temp). graceful empty
// bei fehlender Quelle (kein Crash). sys-scan.ts wird NICHT editiert (Welle-3-INT).
//
// ENTSCHEIDUNG state===null (WP5/PERF-HOCH-01): Ohne Daemon-State (oder ohne
// claude-cli/codex-cli-Zeile darin) werden KEINE Versions-Spawns gestartet —
// liveSources liefert sofort []. Begruendung: Live-`current` ist nur sinnvoll
// mit einer Daemon-Zeile inkl. `remote_latest` als Vergleichswert; ohne State
// wuerde das Ergebnis ohnehin verworfen und scanWatcherStatic greift als
// Fallback. Frueher liefen die 2 Spawns trotzdem (Ergebnis verworfen).
import fs from 'node:fs'
import path from 'node:path'
import type {
  Watcher, WatcherSource, WatcherChangelog, WatcherTier, SourceState
} from '@shared/contract'
import { vcmp } from '@shared/version-compare'
import { isSecretPathForRead } from '../services/secret-guard'
import { configRoots } from '../services/config-roots'
import { getVersionsCached } from '../services/cli-version-cache'
import type { ToolSpec } from '../services/cli-version-live'

// Scope-B-Wurzeln (injizierbar). Default = reale .shared-Pfade.
export interface WatcherRoots {
  referencesDir: string // .shared/.claude/references (enthaelt *-changelog/)
  trackingDir: string // .shared/.claude/coordination/tracking
}

function defaultRoots(): WatcherRoots {
  // Trunk aus der Single Source (Default = real, M1 unveraendert; mit
  // RAWALLM_SANDBOX_ROOT = <sandbox>/.shared/.claude). Pfade bleiben injizierbar.
  const shared = configRoots().sharedClaude
  return {
    referencesDir: path.join(shared, 'references'),
    trackingDir: path.join(shared, 'coordination', 'tracking')
  }
}

// Guarded read: secret-bearing Pfade NIE lesen (Scope-B-Absicherung).
function safeReadJson<T>(p: string): T | null {
  if (isSecretPathForRead(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T } catch { return null }
}

function safeListMd(dir: string): string[] {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')) } catch { return [] }
}

interface DaemonRow { local_version?: string; remote_latest?: string }
type DaemonState = Record<string, DaemonRow | unknown>

// Numerischer Versionsvergleich (QUAL-HOCH-03/WP9): live erfasste installierte
// Version NEUER als gecachtes remote_latest gilt als `current`, nicht `update`.
// Fehlende Seite -> 'recent' (unveraendert). Exportiert fuer Unit-Tests.
export function sourceState(local?: string, latest?: string): SourceState {
  if (local && latest) return vcmp(local, latest) >= 0 ? 'current' : 'update'
  return 'recent'
}

// Live-Version je CLI per `<bin> --version` (bin/args hardcodiert, kein Secret).
const CLI_SPECS: ToolSpec[] = [
  { id: 'claude-cli', bin: 'claude', args: ['--version'] },
  { id: 'codex-cli', bin: 'codex', args: ['--version'] }
]

// CLI-Quellen aus dem Daemon-State (nur Scope-B/tracking). `current` wird LIVE
// per `<bin> --version` erfasst (Fallback: Cache-`local_version`); `latest`
// bleibt aus dem Cache (`remote_latest`). So wird "update" automatisch "current",
// sobald der Owner geupdatet hat. statePath = readFull-Quelldatei (kein Secret).
// state===null ODER keine claude-cli/codex-cli-Zeile -> sofort [], KEINE Spawns
// (siehe Modulkopf: ohne remote_latest greift scanWatcherStatic ohnehin).
async function liveSources(state: DaemonState | null, statePath: string): Promise<WatcherSource[]> {
  if (state === null || (!state['claude-cli'] && !state['codex-cli'])) return []
  const out: WatcherSource[] = []
  const src = isSecretPathForRead(statePath) ? undefined : statePath
  // Live-Versionen EINMAL pro Aufruf erfassen (Prozess-Cache dedupliziert Spawns).
  const live = await getVersionsCached(CLI_SPECS)
  const cli = (id: string, name: string): void => {
    const s = state?.[id] as DaemonRow | undefined
    if (!s) return
    const current = live[id] ?? s.local_version
    out.push({
      name, kind: 'CLI', current: current ?? '—', latest: s.remote_latest ?? '—',
      tier: 1, state: sourceState(current, s.remote_latest), path: src
    })
  }
  cli('claude-cli', 'Claude Code CLI')
  cli('codex-cli', 'Codex CLI')
  return out
}

// Versionierte Changelog-Dateien erkennen: Datum-Praefix `YYYY-MM-DD--name--[v]<version>`
// mit optionalem `--tag`. Mehrpunkt-Versionen (2.1.156, 26.5527.60818) werden toleriert,
// weil version/tag erst am letzten `--`-Segment bzw. `.md` enden.
const VERSIONED_RE = /^(\d{4}-\d{2}-\d{2})--([a-z0-9-]+?)--v?([0-9][0-9.]*(?:-[a-z0-9]+)*)(?:--([a-z0-9-]+))?\.md$/i

interface ParsedChangelog { date: string; tool: string; version: string; tag?: string }

function parseVersioned(file: string): ParsedChangelog | null {
  const m = file.match(VERSIONED_RE)
  if (!m) return null
  return { date: m[1], tool: m[2], version: m[3], tag: m[4] }
}

// Neuesten Changelog je *-changelog-Ordner: ERST versionierte Dateien filtern, DANN nach
// Name (= Datum-Praefix) sortiert die neueste nehmen. Ordner ohne versionierte Datei:
// README/Index als Fallback mit klarem 'Index/Uebersicht'-Label. Secret-Guard je Pfad;
// kein Volltext hier — nur Metadaten + Pfad fuer den readFull-Drilldown.
function liveChangelogs(referencesDir: string): WatcherChangelog[] {
  const out: WatcherChangelog[] = []
  let dirs: string[] = []
  try { dirs = fs.readdirSync(referencesDir).filter((d) => d.endsWith('-changelog')) } catch { dirs = [] }
  for (const d of dirs) {
    const dirPath = path.join(referencesDir, d)
    const files = safeListMd(dirPath)
    const versioned = files.filter((f) => VERSIONED_RE.test(f)).sort()
    const entry = versioned.length
      ? buildVersionedEntry(dirPath, versioned[versioned.length - 1])
      : buildIndexFallback(dirPath, d, files)
    if (entry) out.push(entry)
  }
  return out
}

// Versionierten Eintrag aus dem neuesten Dateinamen bauen (Metadaten + Pfad).
function buildVersionedEntry(dirPath: string, file: string): WatcherChangelog | null {
  const p = parseVersioned(file)
  if (!p) return null
  const fullPath = path.join(dirPath, file)
  if (isSecretPathForRead(fullPath)) return null
  const tag = p.tag ? ` (${p.tag})` : ''
  return {
    tool: p.tool,
    version: p.version,
    date: p.date,
    summary: `Letzter erfasster ${p.tool}-Changelog-Eintrag${tag} (lokal abgelegt).`,
    path: fullPath
  }
}

// Fallback fuer Ordner ohne versionierte Datei: README/Index klar als Uebersicht labeln.
function buildIndexFallback(dirPath: string, dir: string, files: string[]): WatcherChangelog | null {
  const idx = files.find((f) => /index/i.test(f)) ?? files.find((f) => /^readme\.md$/i.test(f)) ?? files[0]
  if (!idx) return null
  const fullPath = path.join(dirPath, idx)
  if (isSecretPathForRead(fullPath)) return null
  const tool = dir.replace(/-changelog$/, '')
  return {
    tool,
    version: 'Index',
    date: '—',
    summary: `Keine versionierte Datei — Uebersicht/Index (${idx}).`,
    path: fullPath
  }
}

function staticTiers(): WatcherTier[] {
  return [
    { id: 1, label: 'Stufe 1', mode: 'auto-erfassen', cls: 'active', desc: 'Automatisch erfasst & signalisiert (read-only).' },
    { id: 2, label: 'Stufe 2', mode: 'gated', cls: 'stale', desc: 'Owner-Freigabe noetig · Flag mit tool+version+timestamp.' },
    { id: 3, label: 'Stufe 3', mode: 'flag-only', cls: 'dup', desc: 'Nur markiert, keine automatische Aktion.' }
  ]
}

// Daemon-State-Datum aus tracking. Kein hardcodierter Kalendertag: fehlt/leer ->
// '—' (Platzhalter), damit das UI nie ein erfundenes Datum anzeigt.
function liveUpdated(state: DaemonState | null): string {
  const claude = state?.['claude-cli'] as (DaemonRow & { detected_at?: string }) | undefined
  const at = claude?.detected_at
  return at ? at.slice(0, 10) : '—'
}

/**
 * Live-Watcher aus Scope-B lesen. Liefert immer ein gueltiges `Watcher`-Objekt;
 * fehlende Quellen ergeben leere Listen + "Unknown"-Daemon (graceful, kein Crash).
 */
export async function scanWatcherLive(roots: WatcherRoots = defaultRoots()): Promise<Watcher> {
  try {
    // Nur tracking lesen — bewusst KEIN coordination/{security,signals,briefings}.
    const statePath = path.join(roots.trackingDir, 'toolchain-daemon-state.json')
    const state = safeReadJson<DaemonState>(statePath)
    const sources = await liveSources(state, statePath)
    const changelogs = liveChangelogs(roots.referencesDir)
    const daemon: Watcher['daemon'] = {
      status: state ? 'Ready' : 'Unknown',
      lastResult: '0',
      schedule: 'Task-Scheduler (run-hidden)',
      tokens: '0 Daemon-LLM-Token',
      sources: sources.length,
      updated: liveUpdated(state),
      note: 'Live aus Scope-B: tracking/toolchain-daemon-state + references/*-changelog (Metadaten). Installierte Version live per `<cli> --version` erfasst; remote_latest weiter aus Cache.'
    }
    return { daemon, tiers: staticTiers(), sources, changelogs }
  } catch (err) {
    console.error('[watcher]', err instanceof Error ? err.message : 'watcher-live-failed')
    return {
      daemon: { status: 'Unknown', lastResult: '—', schedule: '—', tokens: '—', sources: 0, updated: '—', note: 'Watcher-State nicht lesbar.' },
      tiers: [], sources: [], changelogs: []
    }
  }
}
