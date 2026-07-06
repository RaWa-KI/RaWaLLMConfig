import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRafRefresh } from './useRafRefresh'

interface VirtualRowsOptions {
  count: number
  estimateSize: number
  overscan?: number
  enabled?: boolean
}

interface VirtualRange {
  start: number
  end: number
}

function initialRange(count: number, estimateSize: number, overscan: number, enabled: boolean): VirtualRange {
  if (!enabled || count === 0 || typeof window === 'undefined') return { start: 0, end: count }
  const visible = Math.ceil(window.innerHeight / estimateSize) + overscan
  return { start: 0, end: Math.min(count, visible) }
}

export function useVirtualRows(options: VirtualRowsOptions) {
  const { count, estimateSize, overscan = 6, enabled = true } = options
  const ref = useRef<HTMLDivElement | null>(null)
  const [range, setRange] = useState<VirtualRange>(() => initialRange(count, estimateSize, overscan, enabled))
  const measure = useCallback(() => {
    if (!enabled || !ref.current || count === 0) {
      setRange((cur) => (cur.start === 0 && cur.end === count ? cur : { start: 0, end: count }))
      return
    }
    const rect = ref.current.getBoundingClientRect()
    const top = Math.max(0, -rect.top)
    const bottom = Math.min(count * estimateSize, top + window.innerHeight)
    const start = Math.max(0, Math.floor(top / estimateSize) - overscan)
    const end = Math.min(count, Math.ceil(bottom / estimateSize) + overscan)
    setRange((cur) => (cur.start === start && cur.end === end ? cur : { start, end }))
  }, [count, enabled, estimateSize, overscan])
  const scheduleMeasure = useRafRefresh(measure)
  useEffect(() => {
    scheduleMeasure()
    window.addEventListener('scroll', scheduleMeasure, { passive: true })
    window.addEventListener('resize', scheduleMeasure)
    return () => {
      window.removeEventListener('scroll', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
    }
  }, [scheduleMeasure])
  const virtualItems = useMemo(() => {
    return Array.from({ length: range.end - range.start }, (_, i) => range.start + i)
  }, [range.end, range.start])
  return {
    ref,
    virtualItems,
    totalHeight: count * estimateSize,
    beforeHeight: range.start * estimateSize,
    afterHeight: (count - range.end) * estimateSize,
  }
}
