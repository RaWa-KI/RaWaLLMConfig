import type { IntegrityPlan } from '@shared/contract-integrity'
import { Icon } from '../../components/Icon'
import { MovePlanSummary } from './MovePlanSummary'
import {
  reconcileEffectText,
  reconcilePlanFacts,
  reconcileSideLabel
} from './reconcile-plan-controller'
import './ReconcilePlanSummary.css'

// ReconcilePlanSummary — Plan-Vorschau des Ordner-Merges VOR dem zweiten Klick.
// Schwester-Komponente zu MovePlanSummary (kein Neubau): Verweise, Blocker und
// manuell zu pruefende Dateien kommen aus MovePlanSummary, hier kommen nur die
// merge-spezifischen Teile dazu — Wirkungssatz, Datei-Liste, Sicherungshinweis.
// Reine Anzeige, keine Logik: Zaehler/Texte liefert reconcile-plan-controller.
// Zeigt nie Datei-Inhalte oder Werte, nur Pfade, Zaehler und Klartext-Gruende.

export interface ReconcilePlanSummaryProps {
  plan: IntegrityPlan | null
  // Sichtbarer Fehler aus Vorschau oder Ausfuehrung (nie stumm verschlucken).
  error?: string | null
}

const BLOCKER_TITLE = 'Zusammenführen nicht möglich — bitte zuerst manuell prüfen:'

export function ReconcilePlanSummary({ plan, error }: ReconcilePlanSummaryProps) {
  if (!plan && !error) return null
  return (
    <div className="rps">
      {plan ? <PlanBody plan={plan} /> : null}
      {error ? (
        <div className="rps-error" role="alert">
          {Icon.warn}
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

function PlanBody({ plan }: { plan: IntegrityPlan }) {
  const f = reconcilePlanFacts(plan)
  return (
    <>
      <div className="rps-head">
        {Icon.snap}
        <span>{reconcileEffectText(plan)}</span>
      </div>
      {f.truncated ? (
        <div className="rps-note">
          Die Prüfung hat nicht alle Dateien erfasst — die Liste unten ist
          unvollständig. Bitte den Rest danach einzeln prüfen.
        </div>
      ) : null}
      <FileList plan={plan} />
      <MovePlanSummary plans={[plan]} blockerTitle={BLOCKER_TITLE} />
    </>
  )
}

// Betroffene Dateien mit Richtung: rel-Pfad + welche Seite stehen bleibt.
function FileList({ plan }: { plan: IntegrityPlan }) {
  if (plan.fsOps.length === 0) return null
  return (
    <div className="rps-files">
      <div className="rps-files-head">Diese Dateien werden angefasst:</div>
      <div className="rps-files-list">
        {plan.fsOps.map((op, i) => (
          <div className="rps-file" key={`${op.rel ?? op.from}:${i}`}>
            <code>{op.rel || op.from}</code>
            <span>{reconcileSideLabel(op.decision)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
