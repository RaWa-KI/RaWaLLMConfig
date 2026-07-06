import type { MoveVersionedRequest } from '@shared/contract-write-rename'
import type {
  IntegrityPlan,
  IntegrityPreviewResult,
  IntegrityApplyResult,
  IntegrityPreviewRequest,
  IntegrityApplyRequest
} from '@shared/contract-integrity'

// move-plan-controller.ts — reine async-Steuerlogik fuer den Integrity-Move
// (W7), aus MoveDialog ausgelagert (HR27: MoveDialog bleibt <300 Z, kein
// React/JSX hier). Behandelt den Batch-Fall (mehrere Move-Anfragen, z.B.
// version='beide'): pro Anfrage ein Preview/Apply. Mutation laeuft ueber die
// uebergebenen Hook-Funktionen (useIntegrity); kein direkter Bridge-Zugriff.

export type PreviewFn = (req: IntegrityPreviewRequest) => Promise<IntegrityPreviewResult>
export type ApplyFn = (req: IntegrityApplyRequest) => Promise<IntegrityApplyResult>

// Aus allen Plaenen abgeleitete Button-/Anzeige-Fakten.
export interface MovePlanFacts {
  hasBlockers: boolean
  hasRefs: boolean
}

export function planFacts(plans: IntegrityPlan[]): MovePlanFacts {
  return {
    hasBlockers: plans.some((p) => p.blockers.length > 0),
    hasRefs: plans.some((p) => p.referenceOps.length > 0)
  }
}

// Button-Wortlaut abhaengig vom Plan-Zustand (laienverstaendlich).
export function applyButtonLabel(plans: IntegrityPlan[]): string {
  const f = planFacts(plans)
  if (f.hasBlockers) return 'Manuell erforderlich'
  if (f.hasRefs) return 'Referenzen mitziehen und verschieben'
  return 'Verschieben'
}

// Diskriminiertes Preview-Ergebnis: bei Erfolg plans gefuellt + error null, bei
// Fehler plans null + error gesetzt. So kann der interne Preview-Fehler sichtbar
// gemacht werden, statt als leeres Plan-Array einen Schein-Erfolg zu erzeugen.
export interface PreviewOutcome {
  plans: IntegrityPlan[] | null
  error: string | null
}

// Fuer jede Move-Anfrage einen Plan holen. Bei hartem Fehler wird der
// (sanitisierte) Fehlertext PROPAGIERT (plans=null), damit der Aufrufer abbricht
// und ihn anzeigt. Plaene behalten ihren eigenen planHash fuer Apply.
export async function previewPlans(
  reqs: MoveVersionedRequest[],
  preview: PreviewFn
): Promise<PreviewOutcome> {
  const plans: IntegrityPlan[] = []
  for (const req of reqs) {
    const res = await preview({ kind: 'move', req })
    if (res.error || !res.data) return { plans: null, error: res.error || 'preview-failed' }
    plans.push(res.data)
  }
  return { plans, error: null }
}

// Jeden Plan gegen seinen eigenen planHash ausfuehren. Liefert true nur, wenn
// ALLE Plaene sauber applied wurden (kein Rollback, kein Fehler).
export async function applyPlans(plans: IntegrityPlan[], apply: ApplyFn): Promise<boolean> {
  let allOk = true
  for (const plan of plans) {
    const res = await apply({ plan, planHash: plan.planHash })
    if (res.error || !res.data || res.data.rolledBack || !res.data.applied) {
      allOk = false
    }
  }
  return allOk
}
