import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRafRefresh } from './useRafRefresh'
import { initialVirtualRange, virtualRangeFor, type VirtualRange } from './virtual-range'

interface VirtualRowsOptions {
  count: number
  estimateSize: number
  overscan?: number
  enabled?: boolean
}

// Berechnungskern liegt in ./virtual-range (rein, browserlos testbar).
export function useVirtualRows(options: VirtualRowsOptions) {
  const { count, estimateSize, overscan = 6, enabled = true } = options
  const ref = useRef<HTMLDivElement | null>(null)
  const [range, setRange] = useState<VirtualRange>(() =>
    initialVirtualRange(count, estimateSize, overscan, enabled, typeof window === 'undefined' ? null : window.innerHeight)
  )
  const measure = useCallback(() => {
    if (!enabled || !ref.current || count === 0) {
      setRange((cur) => (cur.start === 0 && cur.end === count ? cur : { start: 0, end: count }))
      return
    }
    const rect = ref.current.getBoundingClientRect()
    const next = virtualRangeFor(-rect.top, window.innerHeight, count, estimateSize, overscan)
    setRange((cur) => (cur.start === next.start && cur.end === next.end ? cur : next))
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
