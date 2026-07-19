// scan-caches-teil-b.spec.ts — Teilplan-B-Gates (Main-Performance):
// 1) Scan-Cache-Invalidierung (markScanCachesStale -> Config- + Struktur-Cache)
// 2) strukturScan-Ergebnis-Cache (Hit / force / Stale)
// 3) updatesCheck-TTL-Cache (Hit / force / TTL-Ablauf)
// 4) Event-Loop-Yield: keine Eingabeblockade waehrend gechunkten Scans
// Sandbox: RAWALLM_SANDBOX_ROOT (Scan-Roots) + RAWALLM_UPDATE_DIR (Update-Quelle).
import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox, seedFile } from './fixtures'
import { yieldToEventLoop } from '../../src/main/lib/yield-loop'
import {
  createConfigScanCache, getConfigSnapshot, getConfigScanCacheMeta, resetConfigScanCache
} from '../../src/main/services/config-scan-cache'
import { markScanCachesStale } from '../../src/main/services/scan-invalidation'
import { handleStrukturScan } from '../../src/main/scan/struktur-scan'
import { scanRegistry, scanRegistryAsync } from '../../src/main/scan/engine/build-data'
import {
  checkForUpdates, resetUpdateCheckCacheForTest, setUpdateCheckCacheTtlForTest
} from '../../src/main/services/update-manager'
import { setUpdateMgrDepsForTest } from '../../src/main/services/update-manager-deps'
import type { AppData } from '../../shared/contract'

const ENV_SANDBOX = 'RAWALLM_SANDBOX_ROOT'
const ENV_DIR = 'RAWALLM_UPDATE_DIR'
const ENV_RELEASE = 'RAWALLM_RELEASE_URL'

let savedEnv: Record<string, string | undefined> = {}

test.beforeEach(() => {
  savedEnv = { [ENV_SANDBOX]: process.env[ENV_SANDBOX], [ENV_DIR]: process.env[ENV_DIR], [ENV_RELEASE]: process.env[ENV_RELEASE] }
  process.env[ENV_RELEASE] = 'disabled-for-tests'
  resetUpdateCheckCacheForTest()
  resetConfigScanCache()
  markScanCachesStale('test-reset')
})

test.afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  setUpdateMgrDepsForTest({})
  resetUpdateCheckCacheForTest()
  resetConfigScanCache()
  markScanCachesStale('test-reset')
})

function useSandbox(): ReturnType<typeof makeSandbox> {
  const sb = makeSandbox()
  process.env[ENV_SANDBOX] = sb.root
  return sb
}

// --- 4) Yield / keine Eingabeblockade ----------------------------------------

test('yieldToEventLoop laesst bereits gequeuete Arbeit vor dem Weiterlauf zu', async () => {
  let ran = false
  setImmediate(() => { ran = true })
  await yieldToEventLoop()
  expect(ran).toBe(true)
})

test('keine Eingabeblockade: leichter Call wird waehrend schwerem gechunkten Scan beantwortet', async () => {
  // Simuliert den Familien-Chunk-Rhythmus: 5 x 30 ms synchroner Busy-Block mit
  // Yield dazwischen. Ein monolithischer 150-ms-Block wuerde den Timer-Call
  // (Proxy fuer leichten IPC wie readWatcher) um >= 120 ms verzoegern.
  const cache = createConfigScanCache(async () => {
    for (let i = 0; i < 5; i++) {
      await yieldToEventLoop()
      const end = Date.now() + 30
      while (Date.now() < end) { /* synchroner Scan-Chunk */ }
    }
    return { snapshot: { frozen: false, date: 'x', label: 'x' }, machines: [], llms: [], data: {} } as AppData
  })
  const scan = cache.getSnapshot()
  await yieldToEventLoop() // Scan laeuft jetzt mitten im Busy/Yield-Rhythmus
  const started = Date.now()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const latencyMs = Date.now() - started
  await scan
  expect(latencyMs).toBeLessThan(100)
})

test('scanRegistryAsync liefert identisches Ergebnis wie scanRegistry (Sandbox)', async () => {
  useSandbox()
  const syncResult = scanRegistry()
  const asyncResult = await scanRegistryAsync()
  expect(asyncResult).toEqual(syncResult)
})

// --- 1+2) Invalidierung + strukturScan-Cache ----------------------------------

test('strukturScan: Cache-Hit, force-Bypass und Invalidierung ueber markScanCachesStale', () => {
  const sb = useSandbox()
  mkdirSync(join(sb.root, '.claude', 'skills'), { recursive: true })

  const first = handleStrukturScan(undefined)
  expect(first.error).toBeNull()
  const second = handleStrukturScan(undefined)
  expect(second.data).toBe(first.data) // gleiche Objekt-Referenz = Cache-Hit

  const forced = handleStrukturScan({ force: true })
  expect(forced.data).not.toBe(first.data) // neuer Lauf
  expect(forced.data).toEqual(first.data) // gleicher Inhalt (Sandbox unveraendert)

  mkdirSync(join(sb.root, '.codex', 'agents'), { recursive: true })
  const beforeInvalidate = handleStrukturScan(undefined)
  expect(beforeInvalidate.data).toBe(forced.data) // noch Cache (kein Signal)

  markScanCachesStale('write:test')
  const afterInvalidate = handleStrukturScan(undefined)
  expect(afterInvalidate.data).not.toBe(forced.data) // frisch gescannt
  expect(afterInvalidate.data?.scannedRoots).toEqual(forced.data?.scannedRoots)
})

test('markScanCachesStale invalidiert den Default-Config-Scan-Cache (Rescan mit Reason)', async () => {
  useSandbox()
  const first = await getConfigSnapshot({ reason: 'test-cold' })
  expect(first).toBeTruthy()
  expect(getConfigScanCacheMeta()?.status).toBe('scan')

  await getConfigSnapshot()
  expect(getConfigScanCacheMeta()?.status).toBe('hit') // Cache wirkt

  markScanCachesStale('write:apply')
  await getConfigSnapshot()
  const meta = getConfigScanCacheMeta()
  expect(meta?.status).toBe('scan') // erneuter Scan statt Hit
  expect(meta?.reason).toBe('write:apply')
})

// --- 3) updatesCheck-TTL-Cache ------------------------------------------------

function seedLatest(sb: ReturnType<typeof makeSandbox>, tag: string): void {
  seedFile(sb, 'latest.json', JSON.stringify({
    tag_name: tag, name: tag, body: '', published_at: '2026-06-10T00:00:00Z',
    prerelease: false, assets: []
  }))
  process.env[ENV_DIR] = sb.configDir
}

function installFakeDeps(sb: ReturnType<typeof makeSandbox>): void {
  setUpdateMgrDepsForTest({
    getVersion: () => '0.1.0',
    getTempPath: () => sb.root,
    exportPrefsSnapshot: () => ({ data: { source: 'prefs', snapshotPath: '' }, error: null }),
    resolvePrefsSet: async () => {}
  })
}

test('updatesCheck: TTL-Cache bedient, force umgeht, Ablauf liest frisch', async () => {
  const sb = useSandbox()
  installFakeDeps(sb)

  seedLatest(sb, 'v0.2.0')
  const cold = await checkForUpdates()
  expect(cold.data?.latestVersion).toBe('0.2.0')

  // Quelle aendert sich; ohne force kommt der TTL-Cache (kein Neulesen).
  seedLatest(sb, 'v0.3.0')
  const cached = await checkForUpdates()
  expect(cached.data?.latestVersion).toBe('0.2.0')

  const forced = await checkForUpdates({ force: true })
  expect(forced.data?.latestVersion).toBe('0.3.0')

  // TTL-Ablauf: naechster Check liest die Quelle wieder.
  setUpdateCheckCacheTtlForTest(5)
  await new Promise((resolve) => setTimeout(resolve, 25))
  seedLatest(sb, 'v0.4.0')
  const expired = await checkForUpdates()
  expect(expired.data?.latestVersion).toBe('0.4.0')
})
