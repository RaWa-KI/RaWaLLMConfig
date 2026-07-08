// useSources.ts — Renderer-Hook fuer die Endnutzer-Quellen-Verwaltung + First-
// Run-Flag (OSS Teil C). Liest/mutiert ausschliesslich ueber die getypte
// SourcesApi-Bridge (window.electronAPI) — kein roher IPC, keine Magic-Strings,
// nie ein Secret-Wert. Mutationen sind im Main gegated; der Hook spiegelt nur den
// vom Main zurueckgegebenen Gesamtstand (kein optimistisches Raten).
import { useState } from 'react'
import type {
  UserSource,
  ProviderChoice,
  DiscoveryHit,
  ModelDiscoveryHit,
  AddSourceRequest
} from '@shared/contract-sources'
import { useSourceActions } from './useSourceActions'
import { useSourcesLoader } from './useSourcesLoader'

export interface UseSources {
  sources: UserSource[]
  providers: ProviderChoice[]
  onboardingDone: boolean
  loading: boolean
  error: string | null
  reload(): Promise<void>
  pickFolder(): Promise<string | null>
  discover(): Promise<DiscoveryHit[]>
  discoverModels(): Promise<ModelDiscoveryHit[]>
  addSource(req: AddSourceRequest): Promise<boolean>
  removeSource(id: string): Promise<boolean>
  setEnabled(id: string, enabled: boolean): Promise<boolean>
  completeOnboarding(): Promise<void>
  reopenOnboarding(): Promise<void>
}

export function useSources(): UseSources {
  const [sources, setSources] = useState<UserSource[]>([])
  const [providers, setProviders] = useState<ProviderChoice[]>([])
  // Default true: vor dem ersten Laden KEIN Onboarding-Flash; der Gate prueft
  // zusaetzlich !loading. Echter Wert kommt aus getOnboardingDone().
  const [onboardingDone, setOnboardingDone] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const state = { setSources, setProviders, setOnboardingDone, setLoading, setError }
  const reload = useSourcesLoader(state)
  const actions = useSourceActions({ setSources, setOnboardingDone, setError })

  return {
    sources, providers, onboardingDone, loading, error,
    reload,
    ...actions
  }
}
