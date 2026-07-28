// watcher-live.spec.ts — Watcher-live liest NUR Scope-B (references/*-changelog +
// coordination/tracking) aus injizierten temp-Roots. Assertiert: kein Read
// ausserhalb der Scope-B-Roots, graceful empty bei fehlender Quelle, korrekte
// Daten aus Fixtures. Reine temp-Sandbox, NIE reale .shared.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { scanWatcherLive, sourceState, type WatcherRoots } from '../../src/main/scan/watcher-live'
import type { WatcherSource, WatcherChangelog } from '../../shared/contract'
import { changelogFeed, parseChangelogName } from '../../src/main/scan/changelog-feed'

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
  expect(w.sources.map((s: WatcherSource) => s.name)).toContain('Claude Code CLI')
  expect(w.changelogs.length).toBeGreaterThan(0)
  expect(w.changelogs[0].tool).toBe('claude-code')
})

test('watcher-live zeigt Index-Dateien nicht als Changelog-Feed-Eintraege', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-watcher-index-only-'))
  const referencesDir = join(root, 'references')
  const trackingDir = join(root, 'tracking')
  mkdirSync(join(referencesDir, 'codex-changelog'), { recursive: true })
  mkdirSync(trackingDir, { recursive: true })
  writeFileSync(
    join(referencesDir, 'codex-changelog', 'Codex_Changelog_Index.md'),
    '# Codex Changelog Index\n', 'utf8'
  )
  writeFileSync(
    join(trackingDir, 'toolchain-daemon-state.json'),
    JSON.stringify({
      'codex-cli': { local_version: '0.143.0', remote_latest: '0.143.0' }
    }), 'utf8'
  )

  const roots = { referencesDir, trackingDir }
  assertSandbox(roots)
  const w = await scanWatcherLive(roots)
  expect(w.changelogs).toEqual([])
})

test('Read-Scope ist auf die injizierten Roots begrenzt (kein Read ausserhalb Scope-B)', async () => {
  const roots = makeScopeB()
  // Es darf NUR aus references/tracking gelesen werden — security/signals/briefings
  // existieren nicht einmal im Sandbox-Root; die API kennt nur diese zwei Roots.
  expect(readdirSync(roots.trackingDir)).toContain('toolchain-daemon-state.json')
  expect(readdirSync(roots.referencesDir)).toContain('claude-changelog')
  // Verarbeitung crasht nicht und liefert nur Scope-B-Daten.
  const w = await scanWatcherLive(roots)
  expect(w.sources.every((s: WatcherSource) => s.kind === 'CLI')).toBe(true)
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

// WP-7: Beide realen Namensschemata muessen matchen. Frueher matchte nur A,
// wodurch der reale Bestand (Schema B) 0 Treffer ergab und ein hartcodierter
// Platzhalter ausgeliefert wurde.
test('beide Namensschemata werden erkannt (Datums- UND Versionspraefix)', () => {
  const a = parseChangelogName('2026-06-04--claude-code--v2026-06-04-hooks.md')
  expect(a).toMatchObject({ date: '2026-06-04', tool: 'claude-code' })

  const b = parseChangelogName('v002.001.220--2026-07-25--claude-code--v2.1.220.md')
  expect(b).toMatchObject({ date: '2026-07-25', tool: 'claude-code', version: '2.1.220' })

  // Navigation ist kein Changelog-Eintrag.
  expect(parseChangelogName('Claude_Code_Changelog_Index.md')).toBeNull()
  expect(parseChangelogName('README.md')).toBeNull()
})

test('Feed liefert ordneruebergreifend die juengsten Eintraege (keine feste Allowlist)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-watcher-feed-'))
  const referencesDir = join(root, 'docs', '01-referenz')
  const trackingDir = join(root, 'coordination', 'tracking')
  mkdirSync(trackingDir, { recursive: true })
  // Drei Ordner, davon zwei ausserhalb der frueheren 3er-Allowlist.
  const files: Record<string, string[]> = {
    'claude-changelog': [
      'v002.001.220--2026-07-25--claude-code--v2.1.220.md',
      'v002.001.219--2026-07-24--claude-code--v2.1.219.md'
    ],
    'python-ai-changelog': ['v009.001.001--2026-07-23--pytest--v9.1.1.md', 'README.md'],
    'wordpress-changelog': ['v007.000.002--2026-01-09--wordpress--v7.0.2.md']
  }
  for (const [dir, names] of Object.entries(files)) {
    mkdirSync(join(referencesDir, dir), { recursive: true })
    for (const n of names) writeFileSync(join(referencesDir, dir, n), '# changelog\n', 'utf8')
  }
  writeFileSync(
    join(trackingDir, 'toolchain-daemon-state.json'),
    JSON.stringify({ 'claude-cli': { local_version: '2.1.220', remote_latest: '2.1.220', detected_at: '2026-07-26T16:30:02' } }),
    'utf8'
  )
  const roots = { referencesDir, trackingDir }
  assertSandbox(roots)
  const w = await scanWatcherLive(roots)

  // Alle vier versionierten Dateien aus DREI Ordnern, neueste zuerst.
  expect(w.changelogs.length).toBe(4)
  expect(w.changelogs.map((c: WatcherChangelog) => c.date)).toEqual(['2026-07-25', '2026-07-24', '2026-07-23', '2026-01-09'])
  expect(w.changelogs.map((c: WatcherChangelog) => c.tool)).toContain('pytest')
  expect(w.changelogs.map((c: WatcherChangelog) => c.tool)).toContain('wordpress')
  // Echter Stand aus dem Daemon-State, kein erfundenes Datum.
  expect(w.daemon.updated).toBe('2026-07-26')
})

test('leere Quelle liefert Empty-State statt Platzhalter-Eintrag', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-watcher-feed-empty-'))
  const referencesDir = join(root, 'docs', '01-referenz')
  mkdirSync(join(referencesDir, 'claude-changelog'), { recursive: true })
  writeFileSync(join(referencesDir, 'claude-changelog', 'README.md'), '# nav\n', 'utf8')
  expect(changelogFeed(referencesDir)).toEqual([])
  expect(changelogFeed(join(root, 'gibt-es-nicht'))).toEqual([])
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
