import { useCallback } from 'react'
import type { AppData, System, Watcher } from '@shared/contract'
import type { Slice } from './types'
import {
  bridgeError,
  errorMessage,
  hasConfigBridge,
  readConfigSlice,
  readSystemSlice,
  readWatcherSlice
} from './config-load-bridge'

type SetSlice<T> = (value: Slice<T>) => void
type LoadFn = () => Promise<void>

export type ConfigLoaders = {
  loadAll: LoadFn
  loadConfig: LoadFn
  loadSystem: LoadFn
  loadWatcher: LoadFn
}

export function useConfigLoaders(
  setConfig: SetSlice<AppData>,
  setSystem: SetSlice<System>,
  setWatcher: SetSlice<Watcher>
): ConfigLoaders {
  const setBridgeMissing = useBridgeMissingSetter(setConfig, setSystem, setWatcher)
  const loadConfig = useSliceLoader(setConfig, readConfigSlice, 'Config konnte nicht geladen werden')
  const loadSystem = useSliceLoader(setSystem, readSystemSlice, 'System konnte nicht geladen werden')
  const loadWatcher = useSliceLoader(setWatcher, readWatcherSlice, 'Watcher konnte nicht geladen werden')
  const loadAll = useCallback(async () => {
    if (!hasConfigBridge()) {
      setBridgeMissing()
      return
    }
    await Promise.all([loadConfig(), loadSystem(), loadWatcher()])
  }, [loadConfig, loadSystem, loadWatcher, setBridgeMissing])
  return { loadAll, loadConfig, loadSystem, loadWatcher }
}

function useBridgeMissingSetter(
  setConfig: SetSlice<AppData>,
  setSystem: SetSlice<System>,
  setWatcher: SetSlice<Watcher>
): () => void {
  return useCallback(() => {
    const e = bridgeError()
    setConfig({ data: null, loading: false, error: e })
    setSystem({ data: null, loading: false, error: e })
    setWatcher({ data: null, loading: false, error: e })
  }, [setConfig, setSystem, setWatcher])
}

function useSliceLoader<T>(
  setSlice: SetSlice<T>,
  readSlice: () => Promise<Slice<T>>,
  fallback: string
): LoadFn {
  return useCallback(async () => {
    if (!hasConfigBridge()) {
      setSlice({ data: null, loading: false, error: bridgeError() })
      return
    }
    try {
      setSlice(await readSlice())
    } catch (err) {
      setSlice({ data: null, loading: false, error: errorMessage(err, fallback) })
    }
  }, [fallback, readSlice, setSlice])
}
