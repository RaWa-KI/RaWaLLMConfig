// useDisplayModeSwitch.ts — optimistischer DisplayMode-Wechsel (Teilplan F,
// F-WP2). Der Klick setzt den sichtbaren on-Zustand sofort (caudex-Budget
// Klick-Feedback, hart 200 ms); das schwere App-Re-Render laeuft als React-
// Transition nicht-blockierend hinterher. Keine Logikaenderung am Modus selbst.
import { useEffect, useState, useTransition } from 'react'
import { useStore } from '../state/store'
import type { DisplayMode } from '../state/types'

export function useDisplayModeSwitch(): { active: DisplayMode; onSelect(mode: DisplayMode): void } {
  const { ui, actions } = useStore()
  const [optimistic, setOptimistic] = useState<DisplayMode>(ui.displayMode)
  const [, startTransition] = useTransition()
  // Externe Wechsel (z.B. Overview-Expert-Aktion) synchronisieren nach.
  useEffect(() => { setOptimistic(ui.displayMode) }, [ui.displayMode])
  const onSelect = (mode: DisplayMode): void => {
    setOptimistic(mode)
    startTransition(() => actions.setDisplayMode(mode))
  }
  return { active: optimistic, onSelect }
}
