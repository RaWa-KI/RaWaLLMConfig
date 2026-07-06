import { useCallback, useState } from 'react'
import type {
  IntegrityPreviewRequest,
  IntegrityPreviewResult,
  IntegrityApplyRequest,
  IntegrityApplyResult
} from '@shared/contract-integrity'
import { useStore } from './store'

// Integrity-Store-Slice (W7) — analog store-write-reconcile.tsx. Kapselt den
// Integrity-Transaktionspfad: erst preview() (Plan + planHash holen), dann
// apply() (nur gegen den bestaetigten Plan ausfuehren). Nutzt das vorhandene
// useStore() fuer reload/Toast. Mutation laeuft AUSSCHLIESSLICH ueber
// window.electronAPI.integrity*; KEIN fs/path im Renderer. Secrets fliessen nie.
//
// Bewusst KEIN eigener busy-/error-State im Hook: der MoveDialog steuert seinen
// busy-Zustand selbst (Mehr-Plan-Batch) und die Slices liefern sanitisierte
// IpcResult-Objekte zurueck, die der Aufrufer auswertet. Toast/Reload nur beim
// finalen Apply, nicht beim reinen Preview (Preview mutiert nichts).

export interface IntegrityState {
  // Plan + planHash fuer eine Operation holen (mutiert nichts).
  preview(req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult>
  // Bestaetigten Plan ausfuehren; bei Erfolg reload + Toast, bei Rollback Warn-Toast.
  apply(req: IntegrityApplyRequest): Promise<IntegrityApplyResult>
}

// Sanitisiertes Fehler-Result ohne Bridge (kein throw).
function noBridge<T>(): { data: T | null; error: string } {
  return { data: null, error: 'Bridge nicht verfügbar' }
}

export function useIntegrity(): IntegrityState {
  const { actions } = useStore()

  const preview = useCallback(
    async (req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult> => {
      if (typeof window === 'undefined' || !window.electronAPI?.integrityPreview) {
        return noBridge()
      }
      try {
        return await window.electronAPI.integrityPreview(req)
      } catch {
        return { data: null, error: 'integrity-preview-failed' }
      }
    },
    []
  )

  const apply = useCallback(
    async (req: IntegrityApplyRequest): Promise<IntegrityApplyResult> => {
      if (typeof window === 'undefined' || !window.electronAPI?.integrityApply) {
        actions.showToast('Bridge nicht verfügbar', 'x')
        return noBridge()
      }
      let res: IntegrityApplyResult
      try {
        res = await window.electronAPI.integrityApply(req)
      } catch {
        actions.showToast('Verschieben fehlgeschlagen.', 'x')
        return { data: null, error: 'integrity-apply-failed' }
      }
      if (res.error || !res.data) {
        actions.showToast('Verschieben fehlgeschlagen.', 'x')
        return res
      }
      // Bei Rollback wurde die Quelle NICHT veraendert — ehrlicher Warn-Toast,
      // kein falscher Erfolg. Bei Erfolg frischer Config-Stand + Erfolgs-Toast.
      if (res.data.rolledBack) {
        actions.showToast('Abgebrochen und zurückgerollt — Quelle unverändert.', 'warn')
        return res
      }
      actions.reloadConfig()
      actions.showToast('Verschoben — Verweise wurden mitgezogen.', 'check')
      return res
    },
    [actions]
  )

  return { preview, apply }
}
