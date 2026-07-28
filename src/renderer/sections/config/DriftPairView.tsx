import type { DriftMember } from '@shared/contract-drift'
import { DRIFT_ROOTKIND, DRIFT_VERGLEICH } from '@shared/drift-labels'
import { SECRET_PAAR } from '@shared/dup-labels'
import { Icon } from '../../components/Icon'
import { usePairContent } from './diff-set-parts'
import { DiffColumn, MaskedBadge, OversizeHint, buildFallbackLines, isOversizeFallback } from './diff-shared'

// Paarweiser Vergleich zweier Mitglieder einer Drift-Relation (read-only).
// Laedt beide Seiten per readFull (secret-guarded, NIE reveal) ueber das
// bestehende usePairContent-Muster und zeigt den Side-by-side-Diff mit den
// vorhandenen DiffView-Bausteinen (DiffColumn/MaskedBadge/OversizeHint).
// KEIN MergeEditor hier: Drift-Sicht ist Pruefung, kein Schreibweg — das
// Uebernehmen von Abweichungen bleibt dem bestehenden Duplikat-/Editor-Pfad.

export function DriftPairView({ a, b }: { a: DriftMember; b: DriftMember }) {
  const c = usePairContent(a.path, b.path)
  if (c.state === 'loading') return <div className="diff-loading">{DRIFT_VERGLEICH.ladet}</div>
  if (c.state === 'protected') return <div className="diff-protected">{DRIFT_VERGLEICH.geschuetzt}</div>
  const lines = buildFallbackLines(c.trunk, c.mirror)
  return (
    <div className="diff-set">
      {c.masked && (
        <div className="diff-secret-bar">
          <MaskedBadge count={c.maskedCount} />
          <span className="dir-secret-badge" title={SECRET_PAAR.grundAnzeige}>
            {Icon.key}
            {SECRET_PAAR.badge}
          </span>
        </div>
      )}
      {isOversizeFallback(lines) && <OversizeHint />}
      <div className="diff-cols">
        <DiffColumn side="trunk" head={DRIFT_ROOTKIND[a.rootKind]} tag={DRIFT_ROOTKIND[a.rootKind]} path={a.path} lines={lines} />
        <DiffColumn side="mirror" head={DRIFT_ROOTKIND[b.rootKind]} tag={DRIFT_ROOTKIND[b.rootKind]} path={b.path} lines={lines} />
      </div>
    </div>
  )
}
