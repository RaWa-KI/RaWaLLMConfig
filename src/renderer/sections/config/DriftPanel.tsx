import { useMemo, useState } from 'react'
import type { DriftRelation } from '@shared/contract-drift'
import { DRIFT, DRIFT_IGNORIERTE } from '@shared/drift-labels'
import { DriftEntry } from './DriftEntry'
import './DuplicatePanel.css'

// DriftPanel (Plan 2026-07-20, WP4) — eigener Abschnitt im Duplikat-Bereich
// der userglobal-Familie, oberhalb der Duplikat-Liste. Zeigt Cross-Loader-
// Kopien (DriftRelationen) mit Status, Heuristik-Vorschlag und Nutzer-
// Festlegung. Ignorierte sind standardmaessig ausgeblendet (Schalter mit
// Zaehler) und eingeblendet visuell abgesenkt. KEIN Entfernen hier — erst
// eine 'echte Dublette'-Festlegung aktiviert im Eintrag den bestehenden
// Reconcile-Pfad (Confirm + backup-first via useReconcile).

export function DriftPanel({ relations }: { relations: DriftRelation[] }) {
  const [showIgnored, setShowIgnored] = useState(false)
  const { visible, ignoredCount } = useMemo(() => {
    const ign = relations.filter((r) => r.decision === 'ignored')
    return {
      visible: showIgnored ? relations : relations.filter((r) => r.decision !== 'ignored'),
      ignoredCount: ign.length
    }
  }, [relations, showIgnored])

  if (relations.length === 0) {
    return (
      <div className="dup-panel">
        <div className="empty">
          <p>{DRIFT.leer}</p>
        </div>
      </div>
    )
  }
  return (
    <div className="dup-panel drift-panel">
      <div className="diff-intro">
        <strong>{DRIFT.titel}</strong> — {DRIFT.erklaerung}
      </div>
      {visible.map((rel, i) => (
        <DriftEntry key={`${rel.cat}/${rel.name}`} rel={rel} startOpen={i === 0} dimmed={rel.decision === 'ignored'} />
      ))}
      {ignoredCount > 0 && (
        <button type="button" className="dup-btn" onClick={() => setShowIgnored((v) => !v)}>
          {showIgnored ? DRIFT_IGNORIERTE.ausblenden : DRIFT_IGNORIERTE.einblenden(ignoredCount)}
        </button>
      )}
    </div>
  )
}
