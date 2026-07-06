// src/renderer/sections/referenz/FieldCard.tsx
// Rendert genau EIN RefField (Was/Wann/Sicher/Beispiel/Pitfall) mit Badges
// (seit / erforderlich / managed / alias) und optionalen Surface-Badges.
// Beispielwert ist via CopyChip kopierbar. Praesentational, props-getrieben.
import type { RefField, RefSurface } from '@shared/contract-referenz'
import { Icon } from '../../components/Icon'
import { CopyChip } from './CopyChip'

interface FieldCardProps {
  field: RefField
}

// Kurzlabel je Oberflaeche fuer die Surface-Badges (Richtwert).
const SURF: Record<RefSurface, string> = { cli: 'CLI', ide: 'IDE', desktop: 'Desktop', web: 'Web' }
const SURF_ORDER: RefSurface[] = ['cli', 'ide', 'desktop', 'web']

// Eine Body-Zeile (Was/Wann/Sicher) mit farbigem Label.
function Line({ label, variant, text }: { label: string; variant?: string; text: string }) {
  return (
    <div className="rf-line">
      <span className={'rf-l' + (variant ? ' ' + variant : '')}>{label}</span>
      <p>{text}</p>
    </div>
  )
}

// Surface-Badges: aktive hell, nicht verfuegbare als „off" gedimmt.
function SurfBadges({ surf }: { surf: RefSurface[] }) {
  return (
    <span className="rf-surf" title="Verfügbar auf (Richtwert)">
      {SURF_ORDER.map((s) => (
        <span key={s} className={'surf-badge ' + s + (surf.includes(s) ? '' : ' off')}>
          {SURF[s]}
        </span>
      ))}
    </span>
  )
}

export function FieldCard({ field }: FieldCardProps) {
  const f = field
  return (
    <div className="rfield">
      <div className="rf-head">
        <span className="rf-key">
          <span className="mono">{f.key}</span>
        </span>
        {f.alias && <span className="rf-alias">alias {f.alias}</span>}
        {f.req && <span className="rf-badge req">erforderlich</span>}
        {f.since && <span className="rf-badge since">seit {f.since}</span>}
        {f.managed && <span className="rf-badge mgd">managed</span>}
        {f.surf && <SurfBadges surf={f.surf} />}
      </div>
      <div className="rf-body">
        {f.what && <Line label="Was" text={f.what} />}
        {f.when && <Line label="Wann" variant="when" text={f.when} />}
        {f.safe && <Line label="Sicher" variant="safe" text={f.safe} />}
        {f.example && (
          <div className="rf-line">
            <span className="rf-l ex">Beispiel</span>
            <code className="rf-exval">{f.example}</code>
            <CopyChip text={f.example} label="Beispiel kopieren" />
          </div>
        )}
      </div>
      {f.pitfall && (
        <div className="rf-pit">
          {Icon.warn}
          <span>{f.pitfall}</span>
        </div>
      )}
    </div>
  )
}
