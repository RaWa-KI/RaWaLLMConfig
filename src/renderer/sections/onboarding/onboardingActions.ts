// onboardingActions.ts - action callbacks for the first-run source flow.
import type { Dispatch, SetStateAction } from 'react'
import type { DiscoveryHit, ModelDiscoveryHit } from '@shared/contract-sources'
import type { UseSources } from '../../state/useSources'
import type { OnboardingPhase } from './useOnboardingFlow'

export interface OnboardingActionDeps {
  src: UseSources
  hits: DiscoveryHit[]
  picked: Set<string>
  setPhase: Dispatch<SetStateAction<OnboardingPhase>>
  setHits: Dispatch<SetStateAction<DiscoveryHit[]>>
  setModelHits: Dispatch<SetStateAction<ModelDiscoveryHit[]>>
  setPicked: Dispatch<SetStateAction<Set<string>>>
}

export async function takeOverPickedSources(deps: OnboardingActionDeps): Promise<void> {
  deps.setPhase('busy')
  for (const hit of deps.hits) {
    if (!deps.picked.has(hit.root)) continue
    await deps.src.addSource({
      root: hit.root,
      providerId: hit.providerId,
      label: hit.label,
      enabled: true
    })
  }
  await deps.src.completeOnboarding()
}

export async function skipOnboarding(deps: OnboardingActionDeps): Promise<void> {
  deps.setPhase('busy')
  await deps.src.completeOnboarding()
}

export async function pickOwnSource(deps: OnboardingActionDeps): Promise<void> {
  const path = await deps.src.pickFolder()
  if (!path) return
  if (!deps.hits.some((h) => h.root === path)) {
    deps.setHits((prev) => [...prev, { root: path, providerId: 'claude', label: path }])
  }
  deps.setPicked((prev) => new Set(prev).add(path))
}

export async function pickModelFolder(deps: OnboardingActionDeps): Promise<void> {
  const path = await deps.src.pickFolder()
  if (!path) return
  deps.setPhase('busy')
  await deps.src.addSource({
    root: path,
    providerId: 'local',
    label: 'Lokale Modelle',
    enabled: true
  })
  deps.setModelHits(await deps.src.discoverModels())
  deps.setPhase('choose')
}
