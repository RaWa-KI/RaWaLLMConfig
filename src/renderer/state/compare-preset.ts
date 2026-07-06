import { useCallback, useState } from 'react'
import type { CoverageComparePreset } from './types'

export interface ComparePresetState {
  comparePreset: CoverageComparePreset | null
  setComparePreset(preset: CoverageComparePreset): void
  clearComparePreset(): void
}

export function useComparePresetState(): ComparePresetState {
  const [comparePreset, setPreset] = useState<CoverageComparePreset | null>(null)

  const setComparePreset = useCallback((preset: CoverageComparePreset) => {
    setPreset(preset)
  }, [])

  const clearComparePreset = useCallback(() => {
    setPreset(null)
  }, [])

  return { comparePreset, setComparePreset, clearComparePreset }
}
