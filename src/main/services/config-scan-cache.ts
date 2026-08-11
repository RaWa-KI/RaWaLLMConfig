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
  // Stale-Sequenz (F2): jede markStale-Markierung erhoeht staleSeq. Ein Scan
  // merkt sich den Stand bei seinem Start und darf das Stale-Flag NUR loeschen,
  // wenn zwischendurch nichts Neues markiert wurde. Ohne diese Sequenz loeschte
  // ein Scan, der VOR der Aenderung startete, die Markierung der Aenderung mit —
  // Zaehler und Listen blieben dauerhaft auf dem alten Stand eingefroren.
  staleSeq: number
  // Stale-Stand, den der laufende Scan (inFlight) garantiert abdeckt.
  coveredSeq: number
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
  return {
    cached: null,
    stale: true,
    staleReason: 'cold-start',
    staleSeq: 0,
    coveredSeq: -1,
    inFlight: null,
    meta: null
  }
}

function setStatusMeta(state: ConfigScanCacheState, status: 'hit' | 'join', reason: string): void {
  const stale = status === 'hit' ? false : state.stale
  state.meta = { ...(state.meta ?? pendingMeta(status, reason, stale)), status, reason, stale }
}

async function runScan(scan: ConfigScanner, state: ConfigScanCacheState, reason: string): Promise<AppData> {
  // Stand BEIM START merken — nicht beim Einreihen: der Scan sieht den
  // Dateisystem-Zustand ab genau diesem Moment.
  const seq = state.staleSeq
  state.coveredSeq = seq
  const startedAt = isoNow()
  const start = nowMs()
  const data = await scan()
  state.cached = data
  // Wurde WAEHREND des Laufs erneut markStale gerufen, bleibt stale=true: die
  // frischen Daten sind bereits wieder ueberholt und der naechste getSnapshot
  // muss neu scannen. Sonst ginge die Markierung verloren (F2).
  if (state.staleSeq === seq) {
    state.stale = false
    state.staleReason = ''
  }
  state.meta = {
    status: 'scan',
    reason,
    startedAt,
    finishedAt: isoNow(),
    durationMs: Math.max(0, Math.round(nowMs() - start)),
    stale: state.stale
  }
  return data
}

/**
 * Einen Scan starten. Laeuft bereits ein (inzwischen veralteter) Scan, wird der
 * neue daran ANGEHAENGT statt parallel gestartet — kein doppelter Vollscan, aber
 * garantiert ein Lauf, der die letzte Aenderung sieht.
 */
function startScan(
  scan: ConfigScanner,
  state: ConfigScanCacheState,
  reason: string
): Promise<AppData> {
  const previous = state.inFlight
  const run = (): Promise<AppData> => runScan(scan, state, reason)
  const promise = previous ? previous.then(run, run) : run()
  state.inFlight = promise
  state.coveredSeq = state.staleSeq
  void promise.then(
    () => { if (state.inFlight === promise) state.inFlight = null },
    () => { if (state.inFlight === promise) state.inFlight = null }
  )
  return promise
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
      // Laufenden Scan nur mitbenutzen, wenn er NACH der letzten Stale-
      // Markierung gestartet wurde. Sonst beantwortet ein veralteter Lauf die
      // frische Anforderung — genau der Wettlauf hinter den eingefrorenen
      // Zaehlern/Listen (F2).
      if (state.inFlight && state.coveredSeq === state.staleSeq) {
        setStatusMeta(state, 'join', reason)
        return state.inFlight
      }
      return startScan(scan, state, reason)
    },
    markStale(reason = 'stale'): void {
      state.stale = true
      state.staleReason = reason
      state.staleSeq += 1
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
