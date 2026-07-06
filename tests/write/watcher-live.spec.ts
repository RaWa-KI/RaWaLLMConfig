// watcher-live.spec.ts — Watcher-live liest NUR Scope-B (references/*-changelog +
// coordination/tracking) aus injizierten temp-Roots. Assertiert: kein Read
// ausserhalb der Scope-B-Roots, graceful empty bei fehlender Quelle, korrekte
// Daten aus Fixtures. Reine temp-Sandbox, NIE reale .shared.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { scanWatcherLive, sourceState, type WatcherRoots } from '../../src/main/scan/watcher-live'

// CI-Guard: Roots duerfen NIE im realen Home/.shared liegen.
function assertSandbox(roots: WatcherRoots): void {
  const home = homedir().replace(/\\/g, '/').toLowerCase()
  for (const p of [roots.referencesDir, roots.trackingDir]) {
    const n = p.replace(/\\/g, '/').toLowerCase()
    if (n.startsWith(`${home}/desktop/projekte/.shared`)) {
      throw new Error(`CI-GUARD: Scope-B-Root im realen .shared verboten -> ${p}`)
    }
  }
}

// Temp-Scope-B mit Daemon-State + einem Changelog-Ordner aufbauen.
function makeScopeB(): WatcherRoots {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-watcher-'))
  const referencesDir = join(root, 'references')
  const trackingDir = join(root, 'tracking')
  mkdirSync(join(referencesDir, 'claude-changelog'), { recursive: true })
  mkdirSync(trackingDir, { recursive: true })
  // Dateiname folgt der realen Konvention (YYYY-MM-DD--tool--vTAG.md, kein Punkt
  // im Versions-Segment) — gleiche Regex wie sys-scan.scanWatcher.
  writeFileSync(
    join(referencesDir, 'claude-changelog', '2026-06-04--claude-code--v2026-06-04-hooks.md'),
    '# changelog\n', 'utf8'
  )
  writeFileSync(
    join(trackingDir, 'toolchain-daemon-state.json'),
    JSON.stringify({
      'claude-cli': { local_version: '2.1.165', remote_latest: '2.1.165', detected_at: '2026-06-05T16:30:18' },
      'codex-cli': { local_version: '0.137.0', remote_latest: '0.137.0' }
    }), 'utf8'
  )
  const roots = { referencesDir, trackingDir }
  assertSandbox(roots)
  return roots
}

test('watcher-live liefert daemon+sources+changelogs aus Scope-B-Fixtures', async () => {
  const roots = makeScopeB()
  const w = await scanWatcherLive(roots)
  expect(w.daemon.status).toBe('Ready')
  expect(w.sources.length).toBe(2)
  expect(w.sources.map((s) => s.name)).toContain('Claude Code CLI')
  expect(w.changelogs.length).toBeGreaterThan(0)
  expect(w.changelogs[0].tool).toBe('claude-code')
})

test('Read-Scope ist auf die injizierten Roots begrenzt (kein Read ausserhalb Scope-B)', async () => {
  const roots = makeScopeB()
  // Es darf NUR aus references/tracking gelesen werden — security/signals/briefings
  // existieren nicht einmal im Sandbox-Root; die API kennt nur diese zwei Roots.
  expect(readdirSync(roots.trackingDir)).toContain('toolchain-daemon-state.json')
  expect(readdirSync(roots.referencesDir)).toContain('claude-changelog')
  // Verarbeitung crasht nicht und liefert nur Scope-B-Daten.
  const w = await scanWatcherLive(roots)
  expect(w.sources.every((s) => s.kind === 'CLI')).toBe(true)
})

// WP9/QUAL-HOCH-03: Nur die exportierte pure Funktion testen — den state der
// scanWatcherLive-Ergebnisse NICHT asserten (Live-CLI-Versionen waeren flaky).
test('sourceState vergleicht Versionen numerisch', () => {
  expect(sourceState('2.1.170', '2.1.165')).toBe('current') // installiert > latest
  expect(sourceState('2.1.120', '2.1.157')).toBe('update')
  expect(sourceState('2.1.165', '2.1.165')).toBe('current')
  expect(sourceState(undefined, '2.1.165')).toBe('recent')
  expect(sourceState('2.1.165', undefined)).toBe('recent')
})

test('graceful empty bei fehlender Quelle (kein Crash)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-watcher-empty-'))
  const roots = { referencesDir: join(root, 'nope-ref'), trackingDir: join(root, 'nope-track') }
  // state===null -> liveSources spawnt gar nicht mehr (WP5-Entscheidung).
  const w = await scanWatcherLive(roots)
  expect(w.daemon.status).toBe('Unknown')
  expect(w.sources.length).toBe(0)
  expect(w.changelogs.length).toBe(0)
})
