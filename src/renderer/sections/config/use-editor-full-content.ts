import { useEffect, useState } from 'react'
import { fetchFull } from './use-fetch-full'

export interface FullState {
  loading: boolean
  content: string
  error: string | null
  ready: boolean
}

const EMPTY: FullState = {
  loading: true,
  content: '',
  error: null,
  ready: false,
}

export function useEditorFullContent(path: string) {
  const [full, setFull] = useState<FullState>(EMPTY)
  useEffect(() => {
    let alive = true
    setFull(EMPTY)
    void fetchFull(path, false).then((r) => {
      if (!alive) return
      setFull((s) => ({
        ...s,
        loading: false,
        content: r.content,
        error: r.error,
        ready: r.error === null,
      }))
    })
    return () => {
      alive = false
    }
  }, [path])
  return { full, setFull }
}
