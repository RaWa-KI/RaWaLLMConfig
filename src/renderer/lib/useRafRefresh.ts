import { useCallback, useEffect, useRef } from 'react'

export function useRafRefresh(callback: () => void): () => void {
  const callbackRef = useRef(callback)
  const frameRef = useRef<number | null>(null)
  callbackRef.current = callback
  const schedule = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      callbackRef.current()
    })
  }, [])
  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
  }, [])
  return schedule
}
