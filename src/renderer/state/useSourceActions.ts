// useSourceActions.ts - renderer source actions for useSources.
import { useCallback } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type {
  AddSourceRequest,
  DiscoveryHit,
  ModelDiscoveryHit,
  SetSourceEnabledRequest,
  SourceMutateResult,
  UserSource
} from '@shared/contract-sources'
import { sourceBridge } from './sourceBridge'

export interface SourceActions {
  pickFolder(): Promise<string | null>
  discover(): Promise<DiscoveryHit[]>
  discoverModels(): Promise<ModelDiscoveryHit[]>
  addSource(req: AddSourceRequest): Promise<boolean>
  removeSource(id: string): Promise<boolean>
  setEnabled(id: string, enabled: boolean): Promise<boolean>
  completeOnboarding(): Promise<void>
  reopenOnboarding(): Promise<void>
}

interface SourceActionsState {
  setSources: Dispatch<SetStateAction<UserSource[]>>
  setOnboardingDone: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
}

function useSourceResult(state: SourceActionsState): (res: SourceMutateResult) => boolean {
  const { setSources, setError } = state
  return useCallback((res: SourceMutateResult): boolean => {
    if (res.ok) {
      setSources(res.sources)
      setError(null)
      return true
    }
    setError(res.error ?? 'Aktion fehlgeschlagen')
    return false
  }, [setSources, setError])
}

function useSourceDiscoveryActions(setError: SourceActionsState['setError']) {
  const pickFolder = useCallback(async (): Promise<string | null> => {
    const api = sourceBridge()
    if (!api?.pickFolder) return null
    const res = await api.pickFolder()
    return res.data ?? null
  }, [])

  const discover = useCallback(async (): Promise<DiscoveryHit[]> => {
    const api = sourceBridge()
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
  }, [setError])

  const discoverModels = useCallback(async (): Promise<ModelDiscoveryHit[]> => {
    const api = sourceBridge()
    if (!api?.discoverModels) {
      setError('Bridge nicht verfügbar')
      return []
    }
    const res = await api.discoverModels()
    if (res.error) {
      setError(res.error)
      return []
    }
    setError(null)
    return res.data ?? []
  }, [setError])

  return { pickFolder, discover, discoverModels }
}

function useSourceMutationActions(applyResult: (res: SourceMutateResult) => boolean) {
  const addSource = useCallback(async (req: AddSourceRequest): Promise<boolean> => {
    const api = sourceBridge()
    if (!api?.addSource) return false
    return applyResult(await api.addSource(req))
  }, [applyResult])

  const removeSource = useCallback(async (id: string): Promise<boolean> => {
    const api = sourceBridge()
    if (!api?.removeSource) return false
    return applyResult(await api.removeSource(id))
  }, [applyResult])

  const setEnabled = useCallback(async (id: string, enabled: boolean): Promise<boolean> => {
    const api = sourceBridge()
    if (!api?.setSourceEnabled) return false
    const req: SetSourceEnabledRequest = { id, enabled }
    return applyResult(await api.setSourceEnabled(req))
  }, [applyResult])

  return { addSource, removeSource, setEnabled }
}

function useSourceOnboardingActions(state: SourceActionsState) {
  const { setSources, setOnboardingDone } = state

  const completeOnboarding = useCallback(async (): Promise<void> => {
    const api = sourceBridge()
    if (api?.setOnboardingDone) {
      const res = await api.setOnboardingDone(true)
      if (res.ok) setSources(res.sources)
    }
    setOnboardingDone(true)
  }, [setSources, setOnboardingDone])

  const reopenOnboarding = useCallback(async (): Promise<void> => {
    const api = sourceBridge()
    if (api?.setOnboardingDone) {
      const res = await api.setOnboardingDone(false)
      if (res.ok) setSources(res.sources)
    }
    setOnboardingDone(false)
  }, [setSources, setOnboardingDone])

  return { completeOnboarding, reopenOnboarding }
}

export function useSourceActions(state: SourceActionsState): SourceActions {
  const applyResult = useSourceResult(state)
  const discoveryActions = useSourceDiscoveryActions(state.setError)
  const mutationActions = useSourceMutationActions(applyResult)
  const onboardingActions = useSourceOnboardingActions(state)

  return { ...discoveryActions, ...mutationActions, ...onboardingActions }
}
