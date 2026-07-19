import type { AppData } from '@shared/contract'
import { scanAll, scanAllAsync } from '../scan/scan-index'

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

interface ConfigScanCacheState {
  cached: AppData | null
  stale: boolean
  staleReason: string
  inFlight: Promise<AppData> | null
  meta: ConfigScanCacheMeta | null
}

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

function createInitialState(): ConfigScanCacheState {
  return { cached: null, stale: true, staleReason: 'cold-start', inFlight: null, meta: null }
}

function setStatusMeta(state: ConfigScanCacheState, status: 'hit' | 'join', reason: string): void {
  const stale = status === 'hit' ? false : state.stale
  state.meta = { ...(state.meta ?? pendingMeta(status, reason, stale)), status, reason, stale }
}

async function runScan(scan: ConfigScanner, state: ConfigScanCacheState, reason: string): Promise<AppData> {
  const startedAt = isoNow()
  const start = nowMs()
  try {
    const data = await scan()
    state.cached = data
    state.stale = false
    state.staleReason = ''
    state.meta = {
      status: 'scan',
      reason,
      startedAt,
      finishedAt: isoNow(),
      durationMs: Math.max(0, Math.round(nowMs() - start)),
      stale: false
    }
    return data
  } finally {
    state.inFlight = null
  }
}

function getCachedSnapshot(state: ConfigScanCacheState, reason: string): Promise<AppData> | null {
  if (!state.cached || state.stale) return null
  setStatusMeta(state, 'hit', reason)
  return Promise.resolve(state.cached)
}

export function createConfigScanCache(scan: ConfigScanner = scanAll): ConfigScanCache {
  const state = createInitialState()
  return {
    getSnapshot(options: ConfigSnapshotOptions = {}): Promise<AppData> {
      const reason = options.reason ?? (state.staleReason || DEFAULT_REASON)
      const cachedSnapshot = options.force ? null : getCachedSnapshot(state, reason)
      if (cachedSnapshot) return cachedSnapshot
      if (state.inFlight) {
        setStatusMeta(state, 'join', reason)
        return state.inFlight
      }
      state.inFlight = runScan(scan, state, reason)
      return state.inFlight
    },
    markStale(reason = 'stale'): void {
      state.stale = true
      state.staleReason = reason
    },
    getMeta(): ConfigScanCacheMeta | null {
      return state.meta
    },
    reset(): void {
      Object.assign(state, createInitialState())
    }
  }
}

// Default-Cache nutzt den gechunkten Async-Scan (Teilplan B): der kalte
// Vollscan blockiert den Main-Event-Loop nicht mehr durchgaengig — IPC bleibt
// waehrend des Scans antwortfaehig. scanAll (sync) bleibt Test-/Referenzpfad.
const defaultConfigScanCache = createConfigScanCache(scanAllAsync)

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
