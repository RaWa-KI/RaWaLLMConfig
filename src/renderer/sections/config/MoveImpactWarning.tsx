import type { MoveImpactKind, MoveImpactScanData } from '@shared/contract-write-rename'
import { Icon } from '../../components/Icon'

interface MoveImpactWarningProps {
  impact: MoveImpactScanData | null
}

function kindLabel(kind: MoveImpactKind): string {
  if (kind === 'wikilink') return 'Wikilink'
  if (kind === 'governance-dependency') return 'Verweisfeld'
  if (kind === 'loader-default') return 'Standard-Ladepfad'
  return 'Pfadangabe'
}

export function MoveImpactWarning({ impact }: MoveImpactWarningProps) {
  if (!impact || impact.findings.length === 0) return null
  const suffix = impact.truncated ? 'Mehr Treffer möglich.' : 'Alle Treffer im Scan angezeigt.'
  return (
    <div className="mvd-impact" role="alert">
      <div className="mvd-impact-head">
        {Icon.warn}
        <div>
          <strong>Verweise vor dem Verschieben prüfen</strong>
          <span>{impact.findings.length} Treffer. {suffix}</span>
        </div>
      </div>
      <p>
        Diese Verweise zeigen noch auf den bisherigen Ort. Wenn du noch einmal bestätigst,
        wird trotzdem verschoben. Die Verweise bleiben unverändert.
      </p>
      <div className="mvd-impact-list">
        {impact.findings.map((f, i) => (
          <div className="mvd-impact-item" key={`${f.filePath}:${f.line}:${i}`}>
            <div className="mvd-impact-meta">
              <strong>{kindLabel(f.kind)}</strong>
              <span>{f.filePath}:{f.line}</span>
            </div>
            <code>{f.snippet}</code>
          </div>
        ))}
      </div>
    </div>
  )
}
