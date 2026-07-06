import type { AppData } from '@shared/contract'
import { scanAll } from '../scan/scan-index'

export interface ConfigSnapshotOptions {
  force?: boolean
  reason?: string
}

export interface ConfigScanCacheMeta {
  status: 'cold' | 'hit' | 'join' | 'scan'
  reason: string
  startedAt: string
  finishedAt: string
  durationMs: number
  stale: boolean
}

export type ConfigScanner = () => AppData | Promise<AppData>

export interface ConfigScanCache {
  getSnapshot(options?: ConfigSnapshotOptions): Promise<AppData>
  markStale(reason?: string): void
  getMeta(): ConfigScanCacheMeta | null
  reset(): void
}

const DEFAULT_REASON = 'readConfig'

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function isoNow(): string {
  return new Date().toISOString()
}

function pendingMeta(status: ConfigScanCacheMeta['status'], reason: string, stale: boolean): ConfigScanCacheMeta {
  const at = isoNow()
  return { status, reason, startedAt: at, finishedAt: at, durationMs: 0, stale }
}

export function createConfigScanCache(scan: ConfigScanner = scanAll): ConfigScanCache {
  let cached: AppData | null = null
  let stale = true
  let staleReason = 'cold-start'
  let inFlight: Promise<AppData> | null = null
  let meta: ConfigScanCacheMeta | null = null

  async function runScan(reason: string): Promise<AppData> {
    const startedAt = isoNow()
    const start = nowMs()
    try {
      const data = await scan()
      cached = data
      stale = false
      staleReason = ''
      meta = {
        status: 'scan',
        reason,
        startedAt,
        finishedAt: isoNow(),
        durationMs: Math.max(0, Math.round(nowMs() - start)),
        stale: false
      }
      return data
    } finally {
      inFlight = null
    }
  }

  return {
    getSnapshot(options: ConfigSnapshotOptions = {}): Promise<AppData> {
      const reason = options.reason ?? (staleReason || DEFAULT_REASON)
      if (!options.force && cached && !stale) {
        meta = { ...(meta ?? pendingMeta('hit', reason, false)), status: 'hit', reason, stale: false }
        return Promise.resolve(cached)
      }
      if (inFlight) {
        meta = { ...(meta ?? pendingMeta('join', reason, stale)), status: 'join', reason, stale }
        return inFlight
      }
      inFlight = runScan(reason)
      return inFlight
    },
    markStale(reason = 'stale'): void {
      stale = true
      staleReason = reason
    },
    getMeta(): ConfigScanCacheMeta | null {
      return meta
    },
    reset(): void {
      cached = null
      stale = true
      staleReason = 'cold-start'
      inFlight = null
      meta = null
    }
  }
}

const defaultConfigScanCache = createConfigScanCache()

export function getConfigSnapshot(options: ConfigSnapshotOptions = {}): Promise<AppData> {
  return defaultConfigScanCache.getSnapshot(options)
}

export function markConfigScanCacheStale(reason?: string): void {
  defaultConfigScanCache.markStale(reason)
}

export function getConfigScanCacheMeta(): ConfigScanCacheMeta | null {
  return defaultConfigScanCache.getMeta()
}

export function resetConfigScanCache(): void {
  defaultConfigScanCache.reset()
}
