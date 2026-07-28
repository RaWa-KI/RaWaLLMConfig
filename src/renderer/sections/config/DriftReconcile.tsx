import { useState } from 'react'
import type { DriftMember } from '@shared/contract-drift'
import { Icon } from '../../components/Icon'
import { DRIFT_DUPLICATE } from '@shared/drift-labels'
import { SICHERUNG, WRITE_AUS } from '@shared/dup-labels'
import { useWriteConfig } from '../../state/store-write-config'
import { useReconcile } from '../../state/store-write-reconcile'

// Reconcile-Pfad fuer eine als 'echte Dublette' festgelegte Drift-Relation
// (Erfolgskriterium 4): erst NACH der Festlegung erscheint dieser Block. Er
// ruft den bestehenden Reconcile-Service (reconcile.ts: Confirm hier im UI,
// backup-first + Archiv move-only im Main) — KEIN neuer Loeschweg, keine
// Auto-Aktion. Bezieht sich auf das im Eintrag gewaehlte Mitglieder-Paar.

type Keep = 'keep-trunk' | 'keep-mirror'

export function DriftReconcile({ a, b }: { a: DriftMember; b: DriftMember }) {
  const { busy, run } = useReconcile()
  const { writeEnabled, writeReason } = useWriteConfig()
  const [pending, setPending] = useState<Keep | null>(null)
  const dis = busy || !writeEnabled
  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined

  const confirm = async () => {
    if (!pending) return
    const ok = await run({ trunkPath: a.path, mirrorPath: b.path, decision: pending })
    if (ok) setPending(null)
  }

  if (pending) {
    return (
      <div className="dup-confirm">
        <div className="dup-confirm-title">
          {Icon.warn}
          {DRIFT_DUPLICATE.confirmTitel}
        </div>
        <p className="dup-confirm-text">{DRIFT_DUPLICATE.confirmText}</p>
        <div className="dup-confirm-paths mono">
          <div>{a.path}</div>
          <div>{b.path}</div>
        </div>
        <div className="dup-confirm-hint">{Icon.snap}{SICHERUNG.snapshot}</div>
        <div className="dup-confirm-btns">
          <button type="button" className="dup-btn" onClick={() => setPending(null)} disabled={busy}>
            {Icon.x}
            {DRIFT_DUPLICATE.abbrechen}
          </button>
          <button type="button" className="dup-btn adopt" onClick={() => void confirm()} disabled={dis} title={disabledTitle}>
            {Icon.check}
            {busy ? DRIFT_DUPLICATE.arbeitet : DRIFT_DUPLICATE.bestaetigen}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="dup-row">
      <div className="dup-btns">
        <button type="button" className="dup-btn keep" onClick={() => setPending('keep-trunk')} disabled={dis} title={disabledTitle}>
          {Icon.archive}
          {DRIFT_DUPLICATE.behaltenLinks}
        </button>
        <button type="button" className="dup-btn keep" onClick={() => setPending('keep-mirror')} disabled={dis} title={disabledTitle}>
          {Icon.archive}
          {DRIFT_DUPLICATE.behaltenRechts}
        </button>
      </div>
    </div>
  )
}
