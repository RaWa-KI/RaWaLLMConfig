import { useEffect, useState } from 'react'
import type { AppData, System, Watcher } from '@shared/contract'
import type { Slice } from './types'
import { loadingSlice, type ConfigWatcherFsBridge } from './config-load-bridge'
import { useConfigLoaders } from './config-loaders'

// Auto-Reloads bei fs-Events auf hoechstens einen Voll-Reload pro Intervall
// drosseln (Eventfluten aus Agent-Sessions/Builds, Hang-Regression 2026-07-27).
const AUTORELOAD_MIN_INTERVAL_MS = 2500

export function useConfigLoad() {
  const [config, setConfig] = useState<Slice<AppData>>(loadingSlice)
  const [system, setSystem] = useState<Slice<System>>(loadingSlice)
  const [watcher, setWatcher] = useState<Slice<Watcher>>(loadingSlice)
  const loaders = useConfigLoaders(setConfig, setSystem, setWatcher)
  const { loadAll, loadConfig, loadSystem, loadWatcher } = loaders
  useEffect(() => { void loadConfig() }, [loadConfig])
  useConfigWatcherAutoReload(loadConfig)
  return { config, system, watcher, loadAll, loadConfig, loadSystem, loadWatcher }
}

function useConfigWatcherAutoReload(loadConfig: () => Promise<void>): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const api = window.electronAPI as (typeof window.electronAPI & ConfigWatcherFsBridge) | undefined
    const onConfigChanged = api?.configWatcherFs?.onConfigChanged ?? api?.onConfigChanged
    if (!onConfigChanged) return
    // Hang-Regression 2026-07-27: Reloads bei Eventflut drosseln — maximal ein
    // Voll-Reload pro Intervall, waehrend eines laufenden Loads wird gebundelt
    // und die letzte Aenderung per Trailing-Timer nachgezogen.
    let inFlight = false
    let lastRunAt = 0
    let trailingTimer: ReturnType<typeof setTimeout> | null = null
    const fire = (): void => {
      const elapsed = Date.now() - lastRunAt
      if (inFlight || elapsed < AUTORELOAD_MIN_INTERVAL_MS) {
        if (!trailingTimer) {
          trailingTimer = setTimeout(() => {
            trailingTimer = null
            fire()
          }, Math.max(25, AUTORELOAD_MIN_INTERVAL_MS - elapsed))
        }
        return
      }
      inFlight = true
      lastRunAt = Date.now()
      void loadConfig().finally(() => { inFlight = false })
    }
    const off = onConfigChanged(fire)
    return () => {
      if (trailingTimer) clearTimeout(trailingTimer)
      off()
    }
  }, [loadConfig])
}
