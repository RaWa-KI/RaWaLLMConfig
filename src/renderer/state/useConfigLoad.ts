import { useCallback, useEffect, useState } from 'react'
import type { AppData, System, Watcher } from '@shared/contract'
import type { Slice } from './types'

type ConfigWatcherFsBridge = {
  configWatcherFs?: {
    onConfigChanged(cb: () => void): () => void
  }
  onConfigChanged?(cb: () => void): () => void
}

function loadingSlice<T>(): Slice<T> {
  return { data: null, loading: true, error: null }
}

function bridgeError(): string {
  return 'Bridge nicht verfügbar (Preload nicht geladen)'
}

function hasBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

export function useConfigLoad() {
  const [config, setConfig] = useState<Slice<AppData>>(loadingSlice)
  const [system, setSystem] = useState<Slice<System>>(loadingSlice)
  const [watcher, setWatcher] = useState<Slice<Watcher>>(loadingSlice)
  const setBridgeMissing = useCallback(() => {
    const e = bridgeError()
    setConfig({ data: null, loading: false, error: e })
    setSystem({ data: null, loading: false, error: e })
    setWatcher({ data: null, loading: false, error: e })
  }, [])
  const loadConfig = useCallback(async () => {
    if (!hasBridge()) {
      setConfig({ data: null, loading: false, error: bridgeError() })
      return
    }
    const api = window.electronAPI!
    try {
      const c = await api.readConfig()
      setConfig({ data: c.data, loading: false, error: c.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Config konnte nicht geladen werden'
      setConfig({ data: null, loading: false, error: msg })
    }
  }, [])
  const loadSystem = useCallback(async () => {
    if (!hasBridge()) {
      setSystem({ data: null, loading: false, error: bridgeError() })
      return
    }
    const api = window.electronAPI!
    try {
      const s = await api.readSystem()
      setSystem({ data: s.data, loading: false, error: s.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'System konnte nicht geladen werden'
      setSystem({ data: null, loading: false, error: msg })
    }
  }, [])
  const loadWatcher = useCallback(async () => {
    if (!hasBridge()) {
      setWatcher({ data: null, loading: false, error: bridgeError() })
      return
    }
    const api = window.electronAPI!
    try {
      const w = await api.readWatcher()
      setWatcher({ data: w.data, loading: false, error: w.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Watcher konnte nicht geladen werden'
      setWatcher({ data: null, loading: false, error: msg })
    }
  }, [])
  const loadAll = useCallback(async () => {
    if (!hasBridge()) {
      setBridgeMissing()
      return
    }
    await Promise.all([loadConfig(), loadSystem(), loadWatcher()])
  }, [loadConfig, loadSystem, loadWatcher, setBridgeMissing])
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
