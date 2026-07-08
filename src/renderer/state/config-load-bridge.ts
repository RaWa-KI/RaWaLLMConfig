import type { AppData, System, Watcher } from '@shared/contract'
import type { Slice } from './types'

export type ConfigWatcherFsBridge = {
  configWatcherFs?: {
    onConfigChanged(cb: () => void): () => void
  }
  onConfigChanged?(cb: () => void): () => void
}

export function loadingSlice<T>(): Slice<T> {
  return { data: null, loading: true, error: null }
}

export function bridgeError(): string {
  return 'Bridge nicht verfügbar (Preload nicht geladen)'
}

export function hasConfigBridge(): boolean {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function readConfigSlice(): Promise<Slice<AppData>> {
  const c = await window.electronAPI!.readConfig()
  return { data: c.data, loading: false, error: c.error }
}

export async function readSystemSlice(): Promise<Slice<System>> {
  const s = await window.electronAPI!.readSystem()
  return { data: s.data, loading: false, error: s.error }
}

export async function readWatcherSlice(): Promise<Slice<Watcher>> {
  const w = await window.electronAPI!.readWatcher()
  return { data: w.data, loading: false, error: w.error }
}
