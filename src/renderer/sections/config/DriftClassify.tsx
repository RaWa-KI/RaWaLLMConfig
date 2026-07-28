import { useState } from 'react'
import type { DriftDecision } from '@shared/contract-drift'
import { Icon } from '../../components/Icon'
import { DRIFT_DECISION, DRIFT_DUPLICATE, DRIFT_REVIDIEREN } from '@shared/drift-labels'
import { WRITE_AUS } from '@shared/dup-labels'
import { useWriteConfig } from '../../state/store-write-config'
import { useDriftDecisionWriter } from '../../state/store-write-drift'

// Klassifizierungs-Buttons einer Drift-Relation: Paritäts-Kopie / echte
// Dublette / ignorieren. Write-gated (Schreibmodus aus → disabled, Muster
// Reconcile-Buttons). 'echte Dublette' bekommt einen Confirm-Block, weil
// daraus Entfernen-Wege entstehen; 'parity'/'ignored' sind revidierbar und
// brauchen keinen zusaetzlichen Confirm. Eine gesetzte Festlegung bleibt
// aenderbar — der Store ersetzt denselben Key („Festlegung ändern").

export function DriftClassify({ driftKey, decision }: { driftKey: string; decision?: DriftDecision }) {
  const { writeEnabled, writeReason } = useWriteConfig()
  const { busy, decide } = useDriftDecisionWriter()
  const [pendingDuplicate, setPendingDuplicate] = useState(false)
  const dis = busy || !writeEnabled
  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined

  const pick = async (d: DriftDecision) => {
    if (d === 'duplicate') {
      setPendingDuplicate(true)
      return
    }
    await decide(driftKey, d)
  }
  const confirmDuplicate = async () => {
    if (await decide(driftKey, 'duplicate')) setPendingDuplicate(false)
  }

  if (pendingDuplicate) {
    return (
      <div className="dup-confirm">
        <div className="dup-confirm-title">
          {Icon.warn}
          {DRIFT_DUPLICATE.confirmTitel}
        </div>
        <p className="dup-confirm-text">{DRIFT_DUPLICATE.confirmText}</p>
        <div className="dup-confirm-btns">
          <button type="button" className="dup-btn" onClick={() => setPendingDuplicate(false)} disabled={busy}>
            {Icon.x}
            {DRIFT_DUPLICATE.abbrechen}
          </button>
          <button
            type="button"
            className="dup-btn adopt"
            onClick={() => void confirmDuplicate()}
            disabled={dis}
            title={disabledTitle}
          >
            {Icon.check}
            {busy ? DRIFT_DUPLICATE.arbeitet : DRIFT_DECISION.duplicate}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="dup-row">
      {decision && <span className="deh-desc">{DRIFT_REVIDIEREN.aendern} — {DRIFT_REVIDIEREN.hinweis}</span>}
      <div className="dup-btns">
        {(Object.keys(DRIFT_DECISION) as DriftDecision[]).map((d) => (
          <button
            key={d}
            type="button"
            className={'dup-btn' + (decision === d ? ' keep' : '')}
            onClick={() => void pick(d)}
            disabled={dis || decision === d}
            title={disabledTitle}
          >
            {DRIFT_DECISION[d]}
          </button>
        ))}
      </div>
    </div>
  )
}
