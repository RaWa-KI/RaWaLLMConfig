// cli-version-cache.spec.ts — Once-pro-App-Lauf-Cache fuer Versions-Spawns
// (WP4, PERF-HOCH-01). Assertiert: Dedup ueber bin+args (nicht spec.id),
// In-Flight-Sharing, null-Caching, Re-Spawn nach refreshVersions(). Keine
// echten Spawns: execFn wird injiziert. Singleton-Cache: jeder Test stellt
// seinen Vorzustand selbst her (refreshVersions am Testanfang).
import { test, expect } from '@playwright/test'
import { getVersionsCached, refreshVersions, type VersionExecFn } from '../../src/main/services/cli-version-cache'
import type { ToolSpec } from '../../src/main/services/cli-version-live'

// Zaehlender Fake-Spawner: liefert je bin+args eine feste Version (oder null).
function makeExecFn(result: string | null = '1.2.3'): { execFn: VersionExecFn; calls: string[] } {
  const calls: string[] = []
  const execFn: VersionExecFn = async (bin, args) => {
    calls.push(`${bin} ${args.join(' ')}`)
    return result
  }
  return { execFn, calls }
}

const CLAUDE: ToolSpec = { id: 'claude', bin: 'claude', args: ['--version'] }
// Gleicher Spawn wie CLAUDE, andere id — reale Lage: sys-scan (`claude`,
// VERSION_SPECS) vs. watcher-live (`claude-cli`, CLI_SPECS).
const CLAUDE_CLI: ToolSpec = { id: 'claude-cli', bin: 'claude', args: ['--version'] }
const CODEX: ToolSpec = { id: 'codex', bin: 'codex', args: ['--version'] }

test('zwei Aufrufe gleicher Spec -> execFn nur 1x gerufen (Once pro Lauf)', async () => {
  refreshVersions()
  const { execFn, calls } = makeExecFn('2.1.165')
  // Zweiter Aufruf startet, BEVOR der erste awaited ist -> In-Flight-Sharing.
  const [r1, r2] = await Promise.all([
    getVersionsCached([CLAUDE], execFn),
    getVersionsCached([CLAUDE], execFn)
  ])
  expect(calls.length).toBe(1)
  expect(r1).toEqual({ claude: '2.1.165' })
  expect(r2).toEqual({ claude: '2.1.165' })
  // Auch ein spaeterer (sequentieller) Aufruf trifft den Cache.
  await getVersionsCached([CLAUDE], execFn)
  expect(calls.length).toBe(1)
})

test('zwei Specs mit unterschiedlicher id, gleichem bin+args -> 1 Spawn, 2 id-Eintraege', async () => {
  refreshVersions()
  const { execFn, calls } = makeExecFn('2.1.165')
  const out = await getVersionsCached([CLAUDE, CLAUDE_CLI], execFn)
  expect(calls.length).toBe(1)
  expect(out).toEqual({ claude: '2.1.165', 'claude-cli': '2.1.165' })
  // Unterschiedliches bin -> eigener Spawn (Key dedupliziert nur bin+args).
  const out2 = await getVersionsCached([CODEX], execFn)
  expect(calls.length).toBe(2)
  expect(out2).toEqual({ codex: '2.1.165' })
})

test('refreshVersions() leert den Cache -> erneuter Spawn', async () => {
  refreshVersions()
  const { execFn, calls } = makeExecFn('0.137.0')
  await getVersionsCached([CODEX], execFn)
  expect(calls.length).toBe(1)
  refreshVersions()
  const out = await getVersionsCached([CODEX], execFn)
  expect(calls.length).toBe(2)
  expect(out).toEqual({ codex: '0.137.0' })
})

test('null-Ergebnis wird gecacht (kein Re-Spawn fuer fehlendes Tool)', async () => {
  refreshVersions()
  const { execFn, calls } = makeExecFn(null)
  const out1 = await getVersionsCached([CODEX], execFn)
  const out2 = await getVersionsCached([CODEX], execFn)
  expect(calls.length).toBe(1)
  expect(out1).toEqual({ codex: null })
  expect(out2).toEqual({ codex: null })
})
