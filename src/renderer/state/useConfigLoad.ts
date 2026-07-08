import { useCallback, useEffect, useState } from 'react'
import type { AppData, System, Watcher } from '@shared/contract'
import type { Slice } from './types'
import { loadingSlice, type ConfigWatcherFsBridge } from './config-load-bridge'
import { useConfigLoaders } from './config-loaders'

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
    return onConfigChanged(() => { void loadConfig() })
  }, [loadConfig])
}
