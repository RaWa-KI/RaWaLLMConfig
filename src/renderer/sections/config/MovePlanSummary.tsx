import type { IntegrityPlan } from '@shared/contract-integrity'
import { Icon } from '../../components/Icon'
import './MovePlanSummary.css'

// MovePlanSummary (W7) — laienverstaendliche Anzeige eines (oder mehrerer, bei
// Batch) Integrity-Plaene VOR dem Apply. Reine Anzeige, keine Logik: bekommt die
// fertigen Plaene + abgeleitete Zaehler und rendert drei Bloecke:
//   1. Referenz-Mitzug  — wie viele Verweise in wie vielen Dateien umgezogen werden
//   2. Blocker          — rote Box, Verschieben nicht moeglich (manuell pruefen)
//   3. manualRequired    — Hinweis-Box, nicht blockierend (z.B. Secret-Dateien)
// Secrets/Werte werden nie gezeigt — nur Pfade, Zaehler und Klartext-Gruende.

export interface MovePlanSummaryProps {
  plans: IntegrityPlan[]
}

// Aus allen Plaenen abgeleitete Zaehler/Listen (dedupe ueber Dateipfade).
interface PlanFacts {
  refOps: number
  refFiles: string[]
  blockers: IntegrityPlan['blockers']
  manual: IntegrityPlan['manualRequired']
}

function deriveFacts(plans: IntegrityPlan[]): PlanFacts {
  const refFiles = new Set<string>()
  let refOps = 0
  const blockers: IntegrityPlan['blockers'] = []
  const manual: IntegrityPlan['manualRequired'] = []
  for (const p of plans) {
    refOps += p.referenceOps.length
    for (const op of p.referenceOps) refFiles.add(op.filePath)
    blockers.push(...p.blockers)
    manual.push(...p.manualRequired)
  }
  return { refOps, refFiles: Array.from(refFiles), blockers, manual }
}

export function MovePlanSummary({ plans }: MovePlanSummaryProps) {
  if (plans.length === 0) return null
  const f = deriveFacts(plans)
  return (
    <div className="mps">
      <RefBlock refOps={f.refOps} refFiles={f.refFiles} />
      <BlockerBlock blockers={f.blockers} />
      <ManualBlock manual={f.manual} />
    </div>
  )
}

function RefBlock({ refOps, refFiles }: { refOps: number; refFiles: string[] }) {
  if (refOps === 0) {
    return (
      <div className="mps-info">
        <span>Keine Verweise gefunden, die mitgezogen werden müssen.</span>
      </div>
    )
  }
  return (
    <div className="mps-refs">
      <div className="mps-refs-head">
        {Icon.check}
        <strong>
          {refOps} Verweis{refOps === 1 ? '' : 'e'} in {refFiles.length} Datei
          {refFiles.length === 1 ? '' : 'en'} werden auf den neuen Pfad umgezogen.
        </strong>
      </div>
      <div className="mps-refs-list">
        {refFiles.map((path) => (
          <code key={path}>{path}</code>
        ))}
      </div>
    </div>
  )
}

function BlockerBlock({ blockers }: { blockers: IntegrityPlan['blockers'] }) {
  if (blockers.length === 0) return null
  return (
    <div className="mps-blockers" role="alert">
      <div className="mps-blockers-head">
        {Icon.warn}
        <strong>Verschieben nicht möglich — bitte manuell prüfen:</strong>
      </div>
      <ul>
        {blockers.map((b, i) => (
          <li key={`${b.code}:${b.path ?? ''}:${i}`}>
            {b.reason}
            {b.path ? <code>{b.path}</code> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ManualBlock({ manual }: { manual: IntegrityPlan['manualRequired'] }) {
  if (manual.length === 0) return null
  return (
    <div className="mps-manual">
      <div className="mps-manual-head">
        {Icon.warn}
        <span>
          {manual.length} Datei{manual.length === 1 ? '' : 'en'} brauch
          {manual.length === 1 ? 't' : 'en'} eine manuelle Prüfung (z.B. geschützte
          oder Secret-Dateien) — diese werden NICHT automatisch geändert.
        </span>
      </div>
      <div className="mps-manual-list">
        {manual.map((m, i) => (
          <div className="mps-manual-item" key={`${m.filePath}:${i}`}>
            <code>{m.filePath}</code>
            <span>{m.reason}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
