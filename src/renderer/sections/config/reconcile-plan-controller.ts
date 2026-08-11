// reconcile-plan-controller.ts — reine async-Steuerlogik fuer den Zwei-Klick-
// Ordner-Merge (Schwester zu move-plan-controller.ts). Kein React/JSX, kein
// Bridge-/fs-Zugriff: preview/apply kommen als Funktionen herein (useIntegrity).
//
// Ablauf wie beim Verschieben-Dialog:
//   1. Klick -> previewReconcilePlan(): Plan + planHash holen (mutiert nichts)
//   2. Klick -> applyReconcilePlan(): genau diesen Plan gegen seinen planHash
//      ausfuehren. Aendert sich die Auswahl, wird der Plan verworfen (der Hash
//      wuerde sonst nicht mehr zur sichtbaren Auswahl passen).
//
// Genutzt wird ausschliesslich die bestehende Integrity-Route (integrity:preview
// ungated / integrity:apply gated) — kein neuer IPC-Kanal.
import type { DirReconcileRequest } from '@shared/contract-write-reconcile'
import type { IntegrityPlan } from '@shared/contract-integrity'
import type { PreviewFn, ApplyFn } from './move-plan-controller'

// Diskriminiertes Preview-Ergebnis (Muster move-plan-controller): bei Fehler
// plan=null UND error gesetzt — nie ein leerer Plan als Schein-Erfolg.
export interface ReconcilePreviewOutcome {
  plan: IntegrityPlan | null
  error: string | null
}

// Ergebnis des Apply-Schritts inklusive sichtbarem Fehlertext (kein stiller catch).
export interface ReconcileApplyOutcome {
  ok: boolean
  error: string | null
}

// Aus dem Plan abgeleitete Anzeige-/Button-Fakten.
export interface ReconcilePlanFacts {
  files: number          // Dateien, die zusammengefuehrt werden
  refOps: number         // Verweise, die mitgezogen werden
  refFiles: number       // Dateien, in denen Verweise umgeschrieben werden
  manual: number         // Dateien, die manuell geprueft werden muessen
  hasBlockers: boolean
  nothingToDo: boolean   // Auswahl ergibt keine einzige Aktion
  truncated: boolean     // Plan unvollstaendig (Scan-Limit erreicht)
}

export function reconcilePlanFacts(plan: IntegrityPlan): ReconcilePlanFacts {
  const refFiles = new Set(plan.referenceOps.map((op) => op.filePath))
  return {
    files: plan.fsOps.length,
    refOps: plan.referenceOps.length,
    refFiles: refFiles.size,
    manual: plan.manualRequired.length,
    hasBlockers: plan.blockers.length > 0,
    nothingToDo: plan.fsOps.length === 0,
    truncated: plan.truncated
  }
}

function dateien(n: number): string {
  return n === 1 ? '1 Datei' : `${n} Dateien`
}

// Wortlaut des zweiten Knopfs — sagt konkret, was der Klick ausloest.
export function reconcileApplyLabel(plan: IntegrityPlan): string {
  const f = reconcilePlanFacts(plan)
  if (f.hasBlockers) return 'Manuell erforderlich'
  if (f.nothingToDo) return 'Nichts zu tun'
  if (f.refOps > 0) return `${dateien(f.files)} zusammenführen und Verweise mitziehen`
  return `${dateien(f.files)} zusammenführen`
}

// Wirkungssatz ueber der Plan-Anzeige: was passiert mit wie vielen Dateien und
// was wird vorher gesichert (Alltagssprache, keine Tech-Begriffe).
export function reconcileEffectText(plan: IntegrityPlan): string {
  const f = reconcilePlanFacts(plan)
  if (f.nothingToDo) {
    return 'Nach dieser Auswahl bleibt alles unverändert — es gibt nichts zusammenzuführen.'
  }
  return (
    `${dateien(f.files)} werden zusammengeführt. Von jeder Datei, die dabei ersetzt oder ` +
    'ins Archiv wandert, wird vorher eine Sicherungskopie angelegt.'
  )
}

// Kurzhinweis je Datei-Zeile: welche Seite nach dem Merge stehen bleibt.
export function reconcileSideLabel(decision?: string): string {
  const trunkWins = decision === 'keep-trunk' || decision === 'adopt-mirror'
  return trunkWins ? 'Shared-Fassung bleibt' : 'deine Kopie bleibt'
}

// 1. Klick: Plan + planHash holen. Mutiert nichts (Preview ist read-only).
export async function previewReconcilePlan(
  req: DirReconcileRequest,
  preview: PreviewFn
): Promise<ReconcilePreviewOutcome> {
  const res = await preview({ kind: 'reconcile-folder', req })
  if (res.error || !res.data) {
    return { plan: null, error: applyOrPreviewText(res.error || 'preview-failed') }
  }
  return { plan: res.data, error: null }
}

// 2. Klick: genau diesen Plan gegen seinen planHash ausfuehren. Ein Plan mit
// Blockern wird gar nicht erst geschickt (Main wuerde applied:false liefern).
export async function applyReconcilePlan(
  plan: IntegrityPlan,
  apply: ApplyFn
): Promise<ReconcileApplyOutcome> {
  const f = reconcilePlanFacts(plan)
  if (f.hasBlockers) {
    return { ok: false, error: 'Bitte zuerst die oben genannten Punkte klären — es wurde nichts geändert.' }
  }
  if (f.nothingToDo) {
    return { ok: false, error: 'Diese Auswahl ändert nichts — bitte mindestens eine Datei zuordnen.' }
  }
  const res = await apply({ plan, planHash: plan.planHash })
  if (res.error || !res.data) return { ok: false, error: applyOrPreviewText(res.error ?? '') }
  if (res.data.rolledBack) {
    return { ok: false, error: 'Abgebrochen und vollständig zurückgenommen — die Ordner sind unverändert.' }
  }
  if (!res.data.applied) {
    return { ok: false, error: 'Nicht ausgeführt — es wurde nichts geändert. Bitte die Hinweise oben prüfen.' }
  }
  return { ok: true, error: null }
}

// Technische Fehlercodes in einen Satz mit Handlungshinweis uebersetzen.
function applyOrPreviewText(code: string): string {
  switch (code) {
    case 'plan-hash-mismatch':
    case 'plan-token-mismatch':
      return 'Die Vorschau ist nicht mehr aktuell — bitte erneut prüfen und dann bestätigen.'
    case 'preview-failed':
    case 'integrity-preview-failed':
      return 'Die Vorschau konnte nicht erstellt werden — bitte erneut prüfen.'
    case 'Bridge nicht verfügbar':
      return 'Die App kann gerade nicht auf die Dateien zugreifen — bitte das Fenster neu laden.'
    default:
      return code
        ? `Nicht ausgeführt: ${code}. Es wurde nichts geändert.`
        : 'Nicht ausgeführt — es wurde nichts geändert.'
  }
}
