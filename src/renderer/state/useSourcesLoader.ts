// useSourcesLoader.ts - initial source/provider/onboarding loading for useSources.
import { useCallback, useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { ProviderChoice, UserSource } from '@shared/contract-sources'
import { sourceBridge } from './sourceBridge'

interface SourcesLoaderState {
  setSources: Dispatch<SetStateAction<UserSource[]>>
  setProviders: Dispatch<SetStateAction<ProviderChoice[]>>
  setOnboardingDone: Dispatch<SetStateAction<boolean>>
  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useSourcesLoader(state: SourcesLoaderState): () => Promise<void> {
  const { setSources, setProviders, setOnboardingDone, setLoading, setError } = state

  const reload = useCallback(async (): Promise<void> => {
    const api = sourceBridge()
    if (!api?.listSources) {
      setError('Bridge nicht verfügbar')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [sr, pr, ob] = await Promise.all([
        api.listSources(),
        api.listProviders(),
        api.getOnboardingDone()
      ])
      if (sr.data) setSources(sr.data)
      if (pr.data) setProviders(pr.data)
      setOnboardingDone(Boolean(ob.data))
      setError(sr.error ?? pr.error ?? ob.error ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Laden fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }, [setSources, setProviders, setOnboardingDone, setLoading, setError])

  useEffect(() => {
    void reload()
  }, [reload])

  return reload
}
