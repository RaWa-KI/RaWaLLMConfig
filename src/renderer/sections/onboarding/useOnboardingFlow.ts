import { useEffect, useState } from 'react'
import type { DiscoveryHit, ModelDiscoveryHit } from '@shared/contract-sources'
import type { UseSources } from '../../state/useSources'
import { pickModelFolder, pickOwnSource, skipOnboarding, takeOverPickedSources } from './onboardingActions'

export type OnboardingPhase = 'scan' | 'choose' | 'busy'

export interface OnboardingFlowState {
  phase: OnboardingPhase
  hits: DiscoveryHit[]
  modelHits: ModelDiscoveryHit[]
  picked: Set<string>
  toggle(root: string): void
  takeOver(): Promise<void>
  skip(): Promise<void>
  pickOwn(): Promise<void>
  pickModelFolder(): Promise<void>
}

export function useOnboardingFlow(src: UseSources): OnboardingFlowState {
  const [phase, setPhase] = useState<OnboardingPhase>('scan')
  const [hits, setHits] = useState<DiscoveryHit[]>([])
  const [modelHits, setModelHits] = useState<ModelDiscoveryHit[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const actionDeps = { src, hits, picked, setPhase, setHits, setModelHits, setPicked }

  useEffect(() => {
    let live = true
    void (async () => {
      const [found, models] = await Promise.all([src.discover(), src.discoverModels()])
      if (!live) return
      setHits(found)
      setModelHits(models)
      setPicked(new Set(found.map((h) => h.root)))
      setPhase('choose')
    })()
    return () => {
      live = false
    }
  }, [src])

  async function takeOver(): Promise<void> {
    await takeOverPickedSources(actionDeps)
  }

  async function skip(): Promise<void> {
    await skipOnboarding(actionDeps)
  }

  async function pickOwn(): Promise<void> {
    await pickOwnSource(actionDeps)
  }

  async function pickModel(): Promise<void> {
    await pickModelFolder(actionDeps)
  }

  function toggle(root: string): void {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(root)) next.delete(root)
      else next.add(root)
      return next
    })
  }

  return { phase, hits, modelHits, picked, toggle, takeOver, skip, pickOwn, pickModelFolder: pickModel }
}
