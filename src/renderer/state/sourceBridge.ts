// sourceBridge.ts - typed renderer access to the preload bridge.
export function sourceBridge(): Window['electronAPI'] {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}
