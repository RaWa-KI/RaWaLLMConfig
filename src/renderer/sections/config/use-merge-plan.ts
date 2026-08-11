import { useState } from 'react'
import type { DuplicateSet } from '@shared/contract'
import type { DirReconcileRequest } from '@shared/contract-write'
import type { IntegrityPlan } from '@shared/contract-integrity'
import { useIntegrity } from '../../state/store-write-integrity'
import {
  applyReconcilePlan,
  previewReconcilePlan,
  reconcileApplyLabel,
  reconcilePlanFacts
} from './reconcile-plan-controller'
import { clearPairDispatched, isPairDispatched, markPairDispatched } from './reconcile-dispatch'

// use-merge-plan.ts — Zwei-Klick-Ordner-Merge (HR27-Split aus
// DirReconcileActions.tsx). Erster Klick holt den Plan (integrity:preview —
// read-only, aendert nichts), zweiter Klick fuehrt GENAU diesen Plan gegen
// seinen planHash aus (integrity:apply). Kein JSX, kein fs/Electron im Renderer.

export interface MergePlanState {
  plan: IntegrityPlan | null
  error: string | null
  busy: boolean
  blocked: boolean            // Plan liegt vor, ist aber nicht ausfuehrbar
  reset(): void
  step(req: DirReconcileRequest): Promise<boolean>
}

export function useMergePlan(d: DuplicateSet): MergePlanState {
  const { preview, apply } = useIntegrity()
  const [plan, setPlan] = useState<IntegrityPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function reset(): void {
    setPlan(null)
    setError(null)
  }

  async function step(req: DirReconcileRequest): Promise<boolean> {
    if (busy) return false
    // Ist das Paar noch sichtbar, obwohl es schon einmal ausgefuehrt wurde,
    // stammt die Liste aus einem neuen Scan-Stand — der alte Marker ist dann
    // veraltet. Er wird zurueckgesetzt statt den Klick stumm zu verschlucken:
    // sonst wirkt der Knopf tot (F2-Nebenbefund). Der harte Doppelschutz gegen
    // echtes Doppel-Ausfuehren liegt ohnehin MAIN-seitig ('already-reconciled').
    if (isPairDispatched(d.trunk.path, d.mirror.path)) {
      clearPairDispatched(d.trunk.path, d.mirror.path)
    }
    setBusy(true)
    try {
      if (!plan) {
        const out = await previewReconcilePlan(req, preview)
        setPlan(out.plan)
        setError(out.error)
        return false
      }
      const res = await applyReconcilePlan(plan, apply)
      setError(res.error)
      if (res.ok) markPairDispatched(d.trunk.path, d.mirror.path)
      return res.ok
    } finally {
      setBusy(false)
    }
  }

  const facts = plan ? reconcilePlanFacts(plan) : null
  return {
    plan,
    error,
    busy,
    blocked: !!facts && (facts.hasBlockers || facts.nothingToDo),
    reset,
    step
  }
}

/** Vor der Vorschau prueft der Knopf nur; danach sagt er, was er wirklich tut. */
export function mergeButtonLabel(plan: IntegrityPlan | null): string {
  return plan ? reconcileApplyLabel(plan) : 'Zusammenführen prüfen'
}
