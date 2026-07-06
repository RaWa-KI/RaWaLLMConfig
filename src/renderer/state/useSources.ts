// useSources.ts — Renderer-Hook fuer die Endnutzer-Quellen-Verwaltung + First-
// Run-Flag (OSS Teil C). Liest/mutiert ausschliesslich ueber die getypte
// SourcesApi-Bridge (window.electronAPI) — kein roher IPC, keine Magic-Strings,
// nie ein Secret-Wert. Mutationen sind im Main gegated; der Hook spiegelt nur den
// vom Main zurueckgegebenen Gesamtstand (kein optimistisches Raten).
import { useCallback, useEffect, useState } from 'react'
import type {
  UserSource,
  ProviderChoice,
  DiscoveryHit,
  AddSourceRequest,
  SetSourceEnabledRequest,
  SourceMutateResult
} from '@shared/contract-sources'

export interface UseSources {
  sources: UserSource[]
  providers: ProviderChoice[]
  onboardingDone: boolean
  loading: boolean
  error: string | null
  reload(): Promise<void>
  pickFolder(): Promise<string | null>
  discover(): Promise<DiscoveryHit[]>
  addSource(req: AddSourceRequest): Promise<boolean>
  removeSource(id: string): Promise<boolean>
  setEnabled(id: string, enabled: boolean): Promise<boolean>
  completeOnboarding(): Promise<void>
}

// Bridge sicher holen (im Browser-/Test-Kontext kann sie fehlen).
function bridge(): Window['electronAPI'] {
  return typeof window !== 'undefined' ? window.electronAPI : undefined
}

export function useSources(): UseSources {
  const [sources, setSources] = useState<UserSource[]>([])
  const [providers, setProviders] = useState<ProviderChoice[]>([])
  // Default true: vor dem ersten Laden KEIN Onboarding-Flash; der Gate prueft
  // zusaetzlich !loading. Echter Wert kommt aus getOnboardingDone().
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    const api = bridge()
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
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // Mutations-Ergebnis uebernehmen: bei ok den neuen Gesamtstand spiegeln.
  const applyResult = useCallback((res: SourceMutateResult): boolean => {
    if (res.ok) {
      setSources(res.sources)
      setError(null)
      return true
    }
    setError(res.error ?? 'Aktion fehlgeschlagen')
    return false
  }, [])

  const pickFolder = useCallback(async (): Promise<string | null> => {
    const api = bridge()
    if (!api?.pickFolder) return null
    const res = await api.pickFolder()
    return res.data ?? null
  }, [])

  const discover = useCallback(async (): Promise<DiscoveryHit[]> => {
    const api = bridge()
    if (!api?.discoverSources) {
      setError('Bridge nicht verfügbar')
      return []
    }
    const res = await api.discoverSources()
    if (res.error) {
      setError(res.error)
      return []
    }
    setError(null)
    return res.data ?? []
  }, [])

  const addSource = useCallback(async (req: AddSourceRequest): Promise<boolean> => {
    const api = bridge()
    if (!api?.addSource) return false
    return applyResult(await api.addSource(req))
  }, [applyResult])

  const removeSource = useCallback(async (id: string): Promise<boolean> => {
    const api = bridge()
    if (!api?.removeSource) return false
    return applyResult(await api.removeSource(id))
  }, [applyResult])

  const setEnabled = useCallback(async (id: string, enabled: boolean): Promise<boolean> => {
    const api = bridge()
    if (!api?.setSourceEnabled) return false
    const req: SetSourceEnabledRequest = { id, enabled }
    return applyResult(await api.setSourceEnabled(req))
  }, [applyResult])

  const completeOnboarding = useCallback(async (): Promise<void> => {
    const api = bridge()
    // Flag lokal immer setzen (Gate schliessen), auch ohne Bridge.
    if (api?.setOnboardingDone) {
      const res = await api.setOnboardingDone(true)
      if (res.ok) setSources(res.sources)
    }
    setOnboardingDone(true)
  }, [])

  return {
    sources, providers, onboardingDone, loading, error,
    reload, pickFolder, discover, addSource, removeSource, setEnabled, completeOnboarding
  }
}
