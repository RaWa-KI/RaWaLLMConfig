import type { IntegrityPlan } from '@shared/contract-integrity'
import { SICHERUNG, VERSCHIEBEN, WRITE_AUS } from '@shared/dup-labels'
import { Icon } from '../../components/Icon'
import { OpProgress } from '../../components/OpProgress'
import { MovePlanSummary } from './MovePlanSummary'
import { applyButtonLabel } from './move-plan-controller'
import { sideLabel } from './MoveDialogParts'
import type { MvVersion } from './move-target'

// MoveDialogFooter — Wirkungszeile, Plan-Zusammenfassung, Fortschritt, Fehler
// und Knopfreihe des Verschieben-Dialogs (HR27-Split aus MoveDialog.tsx).
// Reine Anzeige: kein eigener State, kein IPC — alles kommt als Props herein.

export interface MoveFooterProps {
  whatLabel: string
  version: MvVersion
  effPath: string
  fassungen?: [string, string] | null
  missingFile: boolean  // True: Eingabefeld zeigt Ordner ohne Dateiname
  errorText?: string | null
  plans: IntegrityPlan[] | null
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  confirmDisabled: boolean
  onConfirm(): void
  onClose(): void
}

export function MoveFooter(p: MoveFooterProps) {
  const confirmTitle = !p.writeEnabled ? (p.writeReason ?? WRITE_AUS) : undefined
  // Vor dem 1. Klick (kein Plan): „Verschieben prüfen". Mit Plan: Wortlaut je
  // Plan-Zustand (Referenzen mitziehen / nur verschieben / manuell erforderlich).
  const confirmText = p.plans ? applyButtonLabel(p.plans) : VERSCHIEBEN.bestaetigen
  return (
    <>
      <div className="mvd-effect">
        {/* Wortlaut aus den Shared-Labels; mit <strong>-Hervorhebung gerendert,
            daher inline statt eines flachen Helpers. */}
        <strong>{p.whatLabel}</strong> ({sideLabel(p.version, p.fassungen)}) wandert nach <strong>{p.effPath}</strong> ·{' '}
        {SICHERUNG.vorher}.
      </div>
      {p.plans ? <MovePlanSummary plans={p.plans} /> : null}
      {/* Fortschritt nur beim eigentlichen Speichern: Plan liegt vor + laeuft.
          Bei 'beide' meldet jeder Plan unter eigener operationId. */}
      <OpProgress
        active={p.busy && p.plans !== null}
        operationIds={p.plans ? p.plans.map((plan) => plan.operationId) : []}
      />
      {p.missingFile && (
        <div className="mvd-error">
          {Icon.warn}
          <span>Das Ziel ist ein Ordner ohne Dateiname — bitte den Dateinamen ergänzen, sonst kann nicht verschoben werden.</span>
        </div>
      )}
      {p.errorText && (
        <div className="mvd-error">
          {Icon.warn}
          <span>{p.errorText}</span>
        </div>
      )}
      <div className="mvd-btns">
        <button type="button" className="mvd-btn ghost" onClick={p.onClose} disabled={p.busy}>
          {VERSCHIEBEN.abbrechen}
        </button>
        <button
          type="button"
          className="mvd-btn primary"
          onClick={p.onConfirm}
          disabled={p.confirmDisabled}
          title={confirmTitle}
        >
          {Icon.check}
          {p.busy ? 'Arbeitet …' : confirmText}
        </button>
      </div>
    </>
  )
}
