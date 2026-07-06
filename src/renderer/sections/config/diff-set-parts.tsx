import { useEffect, useState } from 'react'
import type { DiffLabels, DiffLine, DuplicateSet } from '@shared/contract'
import { Icon } from '../../components/Icon'
import { SECRET_PAAR } from '@shared/dup-labels'
import {
  DiffColumn,
  MaskedBadge,
  OversizeHint,
  buildFallbackLines,
  fetchContentFull,
  isOversizeFallback
} from './diff-shared'

// Lade-/Anzeige-Bausteine fuer den Einzeldatei-Paar-Diff (HR27-Split aus DiffView.tsx).
// Laedt beide Seiten per readFull (secret-guarded, NIE reveal) und stellt den
// vollstaendigen, editierbaren Inhalt bereit. Maskierte/geschuetzte/oversize Paare
// bleiben read-only (kein editierbarer MergeEditor, kein Save aus maskiertem Text).

// Geladener Voll-Inhalt beider Seiten + Schutz-Metadaten.
export interface PairContent {
  state: 'loading' | 'protected' | 'ready'
  trunk: string
  mirror: string
  masked: boolean
  maskedCount: number
}

const EMPTY: PairContent = { state: 'loading', trunk: '', mirror: '', masked: false, maskedCount: 0 }

// Beide Seiten eines Paars per readFull laden. Quelle fuer den editierbaren Diff
// ist IMMER dieser vollstaendige Stand (nie d.lines, die maskiert/gekappt sein koennen).
export function usePairContent(trunkPath: string, mirrorPath: string): PairContent {
  const [c, setC] = useState<PairContent>(EMPTY)
  useEffect(() => {
    let alive = true
    setC(EMPTY)
    void (async () => {
      const [tc, mc] = await Promise.all([fetchContentFull(trunkPath), fetchContentFull(mirrorPath)])
      if (!alive) return
      if (tc === null || mc === null) {
        setC({ state: 'protected', trunk: '', mirror: '', masked: false, maskedCount: 0 })
        return
      }
      setC({
        state: 'ready',
        trunk: tc.content,
        mirror: mc.content,
        masked: tc.masked || mc.masked,
        maskedCount: tc.maskedCount + mc.maskedCount
      })
    })()
    return () => {
      alive = false
    }
  }, [trunkPath, mirrorPath])
  return c
}

// Read-only Side-by-side-Ansicht (maskierte/geschuetzte/oversize Paare). Keine
// Editier-/Save-Wege; maskierter Text wird nur angezeigt, nie zurueckgeschrieben.
// Bei maskiertem (Secret-classed) Inhalt zusaetzlich „geschützt — nur Anzeige"
// (SECRET_PAAR.badge) + Grund — kein editierbarer/aktiver Pfad auf Secret-Paaren.
export function DiffReadOnly({
  d,
  labels,
  lines,
  masked,
  maskedCount
}: {
  d: DuplicateSet
  labels: DiffLabels
  lines: DiffLine[]
  masked: boolean
  maskedCount: number
}) {
  return (
    <>
      {masked && (
        <div className="diff-secret-bar">
          <MaskedBadge count={maskedCount} />
          <span className="dir-secret-badge" title={SECRET_PAAR.grundAnzeige}>
            {Icon.key}
            {SECRET_PAAR.badge}
          </span>
        </div>
      )}
      {isOversizeFallback(lines) && <OversizeHint />}
      <div className="diff-cols">
        <DiffColumn side="trunk" head={labels.trunk} tag={labels.trunkTag} path={d.trunk.path} lines={lines} />
        <DiffColumn side="mirror" head={labels.mirror} tag={labels.mirrorTag} path={d.mirror.path} lines={lines} />
      </div>
    </>
  )
}

// Read-only Zeilen fuer ein Paar bestimmen: Scanner-Diff bevorzugt, sonst
// client-seitiger LCS-Fallback aus dem geladenen Voll-Inhalt.
export function readOnlyLines(d: DuplicateSet, c: PairContent): DiffLine[] {
  if (d.lines.length > 0) return d.lines
  if (c.state === 'ready') return buildFallbackLines(c.trunk, c.mirror)
  return []
}
