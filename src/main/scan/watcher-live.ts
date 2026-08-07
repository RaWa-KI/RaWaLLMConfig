// watcher-live.ts — liest Toolchain-Watcher-Daemon-State + Changelogs LIVE und
// liefert ein `Watcher`-Objekt (F4). Read-Scope STRIKT auf Scope-B (ZIELE §2.3):
//   - <shared>/docs/01-referenz/*-changelog (Changelog-Ablage, nur Metadaten genutzt)
//   - <shared>/coordination/tracking        (toolchain-daemon-state.json)
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
import { getVersionResultsCached, type VersionResultExecFn } from '../services/cli-version-cache'
import { liveErrorText, type ToolSpec } from '../services/cli-version-live'
import { sharedDataRoots } from './shared-data-roots'
import { changelogFeed, newestChangelogDate } from './changelog-feed'

// Scope-B-Wurzeln (injizierbar). Default = reale .shared-Pfade.
export interface WatcherRoots {
  referencesDir: string // <shared>/docs/01-referenz (enthaelt *-changelog/)
  trackingDir: string // <shared>/coordination/tracking
}

// WP-7 Pfad-Fix: die Wurzeln kommen aus shared-data-roots (per dirname aus
// configRoots().sharedClaude abgeleitet, KEIN neuer ConfigRootKey — Auflage A5).
// Frueher wurde `references`/`coordination/tracking` unter <shared>/.claude
// gesucht; diese Pfade existieren nicht. Pfade bleiben injizierbar (Tests).
function defaultRoots(): WatcherRoots | null {
  const roots = sharedDataRoots()
  if (!roots) return null
  return { referencesDir: roots.referencesDir, trackingDir: roots.trackingDir }
}

// Guarded read: secret-bearing Pfade NIE lesen (Scope-B-Absicherung).
function safeReadJson<T>(p: string): T | null {
  if (isSecretPathForRead(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as T } catch { return null }
}

interface DaemonRow { local_version?: string; remote_latest?: string; detected_at?: string }
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
// per `<bin> --version` erfasst. WP-F4F9: Spawn-Fehler und „alte Version" sind
// getrennt — schlaegt der Spawn fehl, faellt `current` auf die Daemon-Datei
// zurueck, traegt aber liveError (Grund) + detectedAt (Datei-Stand) und eine
// note, die den Datei-Fallback sichtbar datiert. So wird "update" automatisch
// "current", sobald der Owner geupdatet hat. statePath = readFull-Quelldatei
// (kein Secret). state===null ODER keine claude-cli/codex-cli-Zeile -> sofort
// [], KEINE Spawns (siehe Modulkopf). execFn injizierbar (Tests ohne Spawns).
async function liveSources(
  state: DaemonState | null, statePath: string, execFn?: VersionResultExecFn
): Promise<WatcherSource[]> {
  if (state === null || (!state['claude-cli'] && !state['codex-cli'])) return []
  const out: WatcherSource[] = []
  const src = isSecretPathForRead(statePath) ? undefined : statePath
  // Live-Versionen EINMAL pro Aufruf erfassen (Prozess-Cache dedupliziert Spawns).
  const live = await getVersionResultsCached(CLI_SPECS, execFn)
  const cli = (id: string, name: string): void => {
    const s = state?.[id] as DaemonRow | undefined
    if (!s) return
    const res = live[id]
    if (res?.version) {
      out.push({
        name, kind: 'CLI', channel: 'cli', current: res.version,
        latest: s.remote_latest ?? '—', tier: 1,
        state: sourceState(res.version, s.remote_latest), path: src,
        detectedAt: s.detected_at
      })
      return
    }
    // Spawn-Fehler: Datei-Fallback, klar als solcher ausgewiesen und datiert.
    const reason = liveErrorText(res?.error ?? null)
    const stamp = s.detected_at?.slice(0, 10)
    out.push({
      name, kind: 'CLI', channel: 'cli', current: s.local_version ?? '—',
      latest: s.remote_latest ?? '—', tier: 1,
      state: sourceState(s.local_version, s.remote_latest), path: src,
      liveError: res?.error ?? 'cli-no-version-output',
      detectedAt: s.detected_at,
      note: `Live-Pruefung nicht moeglich (${reason}) — Stand aus Daemon-Datei${stamp ? ` vom ${stamp}` : ''}.`
    })
  }
  cli('claude-cli', 'Claude Code CLI')
  cli('codex-cli', 'Codex CLI')
  return out
}

// Changelog-Feed: dynamisches Scannen ALLER `*-changelog`-Ordner, beide
// Namensschemata, ordneruebergreifend die juengsten Eintraege (changelog-feed.ts).
// Kein Volltext hier — nur Metadaten + Pfad fuer den readFull-Drilldown.
function liveChangelogs(referencesDir: string): WatcherChangelog[] {
  return changelogFeed(referencesDir)
}

function staticTiers(): WatcherTier[] {
  return [
    { id: 1, label: 'Stufe 1', mode: 'auto-erfassen', cls: 'active', desc: 'Automatisch erfasst & signalisiert (read-only).' },
    { id: 2, label: 'Stufe 2', mode: 'gated', cls: 'stale', desc: 'Owner-Freigabe noetig · Flag mit tool+version+timestamp.' },
    { id: 3, label: 'Stufe 3', mode: 'flag-only', cls: 'dup', desc: 'Nur markiert, keine automatische Aktion.' }
  ]
}

// Echter „Stand" — in dieser Reihenfolge aus realen Quellen, NIE hardcodiert:
//   1. juengstes `detected_at` im Daemon-State,
//   2. mtime der Daemon-State-Datei,
//   3. Datum des juengsten Changelog-Eintrags.
// Keine Quelle -> '—' (ehrlicher Empty-State statt erfundenem Datum).
function liveUpdated(state: DaemonState | null, statePath: string, referencesDir: string): string {
  const stamps = Object.values(state ?? {})
    .map((row) => (row as { detected_at?: string } | null)?.detected_at)
    .filter((v): v is string => typeof v === 'string' && v.length >= 10)
    .sort()
  if (stamps.length) return stamps[stamps.length - 1].slice(0, 10)
  try {
    if (!isSecretPathForRead(statePath)) {
      return fs.statSync(statePath).mtime.toISOString().slice(0, 10)
    }
  } catch { /* graceful */ }
  return newestChangelogDate(referencesDir) ?? '—'
}

function notConfiguredWatcher(): Watcher {
  return {
    daemon: { status: 'Unknown', lastResult: '—', schedule: '—', tokens: '0', sources: 0, updated: '—', note: 'Nicht konfiguriert — bitte in Einstellungen einen Shared-Ordner waehlen.' },
    tiers: [], sources: [], changelogs: []
  }
}

/**
 * Live-Watcher aus Scope-B lesen. Liefert immer ein gueltiges `Watcher`-Objekt;
 * fehlende Quellen ergeben leere Listen + "Unknown"-Daemon (graceful, kein Crash).
 */
export async function scanWatcherLive(
  roots: WatcherRoots | null = defaultRoots(),
  execFn?: VersionResultExecFn
): Promise<Watcher> {
  if (!roots) return notConfiguredWatcher()
  try {
    // Nur tracking lesen — bewusst KEIN coordination/{security,signals,briefings}.
    const statePath = path.join(roots.trackingDir, 'toolchain-daemon-state.json')
    const state = safeReadJson<DaemonState>(statePath)
    const sources = await liveSources(state, statePath, execFn)
    const changelogs = liveChangelogs(roots.referencesDir)
    const daemon: Watcher['daemon'] = {
      status: state ? 'Ready' : 'Unknown',
      lastResult: '0',
      schedule: 'Task-Scheduler (run-hidden)',
      tokens: '0 Daemon-LLM-Token',
      sources: sources.length,
      updated: liveUpdated(state, statePath, roots.referencesDir),
      note: `Live aus Scope-B: coordination/tracking/toolchain-daemon-state + docs/01-referenz/*-changelog (Metadaten, ${changelogs.length} juengste Eintraege). Installierte Version live per \`<cli> --version\` erfasst; remote_latest weiter aus Cache. Wird bei jedem Abruf der Sektion neu gelesen.`
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

// ── Statischer Fallback (aus sys-scan.ts, HR27-Split WP-F4F9) ───────────────
// Quellen NUR aus dem realen Daemon-State. Kein Versions-Hardcode: bei fehlendem
// State leere Liste -> ehrlicher Empty-State im UI. WP-F4F9: der Datei-Stand
// wird mit detected_at datiert und als Datei-Fallback ausgewiesen — er wirkt
// nicht wie eine frische Live-Pruefung. Read-only, kein Secret.
export function scanWatcherStatic(roots: WatcherRoots | null = defaultRoots()): Watcher {
  if (!roots) return notConfiguredWatcher()
  const statePath = path.join(roots.trackingDir, 'toolchain-daemon-state.json')
  const state = safeReadJson<DaemonState>(statePath)
  const sources = staticSources(state, statePath)
  const daemon: Watcher['daemon'] = {
    status: state ? 'Ready' : 'Unknown',
    lastResult: state ? '0' : '—',
    schedule: 'Task-Scheduler (run-hidden)',
    tokens: '0 Daemon-LLM-Token', sources: sources.length,
    updated: liveUpdated(state, statePath, roots.referencesDir),
    note: 'Datei-Stand aus coordination/tracking/toolchain-daemon-state (nicht live geprueft). Deterministische Erkennung von Tool-/Modell-Updates; legt Changelog-Volltexte lokal ab.'
  }
  return { daemon, tiers: staticTiers(), sources, changelogs: changelogFeed(roots.referencesDir) }
}

// Datei-Quellen ohne Live-Spawn: channel 'cli', detected_at als detectedAt,
// note datiert den Datei-Stand explizit.
function staticSources(state: DaemonState | null, statePath: string): WatcherSource[] {
  const out: WatcherSource[] = []
  const src = isSecretPathForRead(statePath) ? undefined : statePath
  const cli = (id: string, name: string): void => {
    const s = state?.[id] as DaemonRow | undefined
    if (!s) return
    const stamp = s.detected_at?.slice(0, 10)
    out.push({
      name, kind: 'CLI', channel: 'cli', current: s.local_version ?? '—',
      latest: s.remote_latest ?? '—', tier: 1,
      state: sourceState(s.local_version, s.remote_latest), path: src,
      detectedAt: s.detected_at,
      note: `Stand aus Daemon-Datei${stamp ? ` vom ${stamp}` : ''} — nicht live geprueft.`
    })
  }
  cli('claude-cli', 'Claude Code CLI')
  cli('codex-cli', 'Codex CLI')
  return out
}
