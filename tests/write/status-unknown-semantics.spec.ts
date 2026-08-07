// status-unknown-semantics.spec.ts — WP-F4F9 (2026-08-07): „nicht pruefbar"
// (unknown) ist von „veraltet" (stale) getrennt. Kernbeweise:
//  (1) sys-scan versionEntry: Spawn-Fehler -> status 'unknown' + Grund, NIE stale.
//  (2) watcher-live: installierte NEUERE Version (live) loest 'current' aus,
//      obwohl die Daemon-Datei noch ein Update meldet (Codex 0.146.0 -> 0.146.1).
//  (3) watcher-live: Spawn-Fehler -> Datei-Fallback mit liveError + detectedAt
//      + datierender note — Fehler und „alte Version" sind unterscheidbar.
//  (4) Refresh-Pfad: refreshVersions() leert den Ergebnis-Cache -> Re-Spawn.
// Singleton-Versions-Cache: jeder Test, der spawnt, ruft vorher refreshVersions()
// (Muster cli-version-cache.spec.ts) — sonst wuerde ein fremder Cache-Treffer
// die injizierte execFn ueberstimmen.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
import { versionEntry } from '../../src/main/scan/sys-scan'
import { scanWatcherLive, type WatcherRoots } from '../../src/main/scan/watcher-live'
import { getVersionResultsCached, refreshVersions } from '../../src/main/services/cli-version-cache'
import { liveErrorText, resolveBinCandidate, type ToolVersionResult } from '../../src/main/services/cli-version-live'

// ── (1) sys-scan: Spawn-Fehler -> unknown statt stale ───────────────────────
test('F4F9 sys-scan: PHP-Spawn-Fehler -> status unknown mit Grund, nie stale', () => {
  const fail: ToolVersionResult = { version: null, error: 'cli-not-in-path' }
  const entry = versionEntry('php', 'PHP', 'CLI', fail, 'cli')
  expect(entry.status).toBe('unknown')
  expect(entry.status).not.toBe('stale')
  expect(entry.v).toBe('—')
  expect(entry.desc).toContain('nicht pruefbar')
  expect(entry.desc).toContain('PATH')
  expect(entry.fields?.['Pruefung']).toContain('nicht pruefbar')
  expect(entry.channel).toBe('cli')
})

test('F4F9 sys-scan: erfolgreicher Spawn -> active mit Version', () => {
  const ok: ToolVersionResult = { version: '8.4.1', error: null }
  const entry = versionEntry('php', 'PHP', 'CLI', ok, 'cli')
  expect(entry.status).toBe('active')
  expect(entry.v).toBe('8.4.1')
  expect(entry.desc).toBe('CLI')
})

test('F4F9: liveErrorText bildet jeden Fehlerschluessel auf einen Grund ab', () => {
  expect(liveErrorText('cli-not-in-path')).toContain('PATH')
  expect(liveErrorText('cli-timeout')).toContain('Zeitueberschreitung')
  expect(liveErrorText('cli-no-version-output')).toContain('keine Versionsausgabe')
  expect(liveErrorText(null)).toContain('keine Versionsausgabe')
})

// ── Watcher-Fixtures (Temp-Sandbox, NIE reale .shared) ──────────────────────
function makeScopeB(state: Record<string, unknown>): WatcherRoots {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-f4f9-'))
  const referencesDir = join(root, 'references')
  const trackingDir = join(root, 'tracking')
  mkdirSync(referencesDir, { recursive: true })
  mkdirSync(trackingDir, { recursive: true })
  writeFileSync(join(trackingDir, 'toolchain-daemon-state.json'), JSON.stringify(state), 'utf8')
  const home = homedir().replace(/\\/g, '/').toLowerCase()
  expect(root.replace(/\\/g, '/').toLowerCase().startsWith(`${home}/desktop/projekte/.shared`)).toBe(false)
  return { referencesDir, trackingDir }
}

// ── (2) installierte neue Version loest 'current' aus ────────────────────────
test('F4F9 watcher: live installierte 0.146.1 bei Datei-Update 0.146.0 -> 0.146.1 wird current', async () => {
  refreshVersions()
  const roots = makeScopeB({
    'codex-cli': { local_version: '0.146.0', remote_latest: '0.146.1', detected_at: '2026-08-01T10:00:00' }
  })
  const w = await scanWatcherLive(roots, async (bin) =>
    bin === 'codex' ? { version: '0.146.1', error: null } : { version: null, error: 'cli-not-in-path' })
  const codex = w.sources.find((s) => s.name === 'Codex CLI')!
  expect(codex.current).toBe('0.146.1')
  expect(codex.state).toBe('current')
  expect(codex.liveError).toBeUndefined()
  expect(codex.channel).toBe('cli')
})

// ── (3) Spawn-Fehler vom Alte-Version-Fall getrennt ──────────────────────────
test('F4F9 watcher: Spawn-Fehler -> Datei-Fallback mit liveError + detectedAt + datierter note', async () => {
  refreshVersions()
  const roots = makeScopeB({
    'codex-cli': { local_version: '0.146.0', remote_latest: '0.146.1', detected_at: '2026-08-01T10:00:00' }
  })
  const w = await scanWatcherLive(roots, async () => ({ version: null, error: 'cli-not-in-path' }))
  const codex = w.sources.find((s) => s.name === 'Codex CLI')!
  expect(codex.current).toBe('0.146.0') // Datei-Fallback
  expect(codex.state).toBe('update') // Datei-Wahrheit bleibt sichtbar
  expect(codex.liveError).toBe('cli-not-in-path')
  expect(codex.detectedAt).toBe('2026-08-01T10:00:00')
  expect(codex.note ?? '').toContain('Daemon-Datei')
  expect(codex.note ?? '').toContain('2026-08-01')
})

// ── (4) Refresh-Pfad: Cache leeren -> Re-Spawn mit neuem Ergebnis ────────────
test('F4F9 refresh: refreshVersions() leert den Result-Cache -> erneuter Spawn', async () => {
  refreshVersions()
  let calls = 0
  const execFn = async (): Promise<ToolVersionResult> => {
    calls += 1
    return calls === 1
      ? { version: null, error: 'cli-timeout' }
      : { version: '0.146.1', error: null }
  }
  const spec = [{ id: 'codex-cli', bin: 'codex-f4f9-test', args: ['--version'] }]
  const first = await getVersionResultsCached(spec, execFn)
  expect(first['codex-cli']).toEqual({ version: null, error: 'cli-timeout' })
  // Fehler wird gecacht (Once pro Lauf) — kein stiller Re-Spawn.
  const cached = await getVersionResultsCached(spec, execFn)
  expect(calls).toBe(1)
  expect(cached['codex-cli'].version).toBeNull()
  // Refresh leert -> naechster Aufruf spawnt neu und sieht die neue Version.
  refreshVersions()
  const fresh = await getVersionResultsCached(spec, execFn)
  expect(calls).toBe(2)
  expect(fresh['codex-cli']).toEqual({ version: '0.146.1', error: null })
})

// Owner-Befund 2026-08-07: die installierte App erbt einen Explorer-PATH ohne
// die CLI-Shim-Ordner — Live-Pruefung scheiterte, Ansicht fiel auf die stale
// Daemon-Datei zurueck. Bekannte Installationsorte muessen PATH-unabhaengig
// gewinnen; „not recognized" ist ein PATH-Problem, keine fehlende Ausgabe.
test('resolveBinCandidate: bekannte Installationsorte gewinnen vor dem PATH', () => {
  const home = homedir()
  // Plattform-ehrlich (CI-Ubuntu-Fail 2026-08-07): win32 prueft .exe/.cmd,
  // POSIX den nackten Namen unter ~/.local/bin.
  const local = process.platform === 'win32'
    ? join(home, '.local', 'bin', 'claude.exe')
    : join(home, '.local', 'bin', 'claude')
  expect(resolveBinCandidate('claude', (p) => p === local)).toBe(local)
  const npm = process.platform === 'win32' && process.env.APPDATA
    ? join(process.env.APPDATA, 'npm', 'codex.cmd')
    : null
  if (npm) expect(resolveBinCandidate('codex', (p) => p === npm)).toBe(npm)
  // Kein Kandidat vorhanden -> unveraenderter PATH-Weg.
  expect(resolveBinCandidate('php', () => false)).toBe('php')
  // Bereits pfad-qualifizierte bins bleiben unangetastet.
  expect(resolveBinCandidate('C:\\tools\\x.exe', () => true)).toBe('C:\\tools\\x.exe')
})
