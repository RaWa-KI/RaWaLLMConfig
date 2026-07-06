// src/renderer/sections/referenz/PortPanel.tsx
// Zeigt das Feld-Mapping Claude → Codex aus dem deklarativen portProfile, je Artefakt
// in vier Eimern: direkt uebernommen / umbenannt-umgeformt / kein Aequivalent / Ziel ohne
// Quelle. Plus Versionsstempel (portProfile.version + validFor). Daten kommen secret-frei.
import type { ReactElement } from 'react'
import type { PortBucket, PortKind, PortRow } from '@shared/contract-referenz'
import { Icon } from '../../components/Icon'
import { portProfile } from './port-profile'

interface PortPanelProps {
  artifactId?: string
}

// Sichtbare Eimer-Labels (Deutsch, echte Umlaute). „add" = Ziel-Feld ohne Quelle.
type BucketKind = PortKind | 'add'
const BUCKETS: { kind: BucketKind; label: string; cls: string }[] = [
  { kind: 'direct', label: 'direkt übernommen', cls: 'b-direct' },
  { kind: 'transform', label: 'umbenannt/umgeformt', cls: 'b-transform' },
  { kind: 'drop', label: 'kein Äquivalent', cls: 'b-drop' },
  { kind: 'add', label: 'Ziel ohne Quelle', cls: 'b-add' },
]
const ICN: Record<BucketKind, ReactElement> = {
  direct: Icon.check,
  transform: Icon.arrow,
  drop: Icon.warn,
  add: Icon.plus,
}

// Eine Mapping-Zeile (Quelle → Ziel) eines Eimers.
function MapRow({ from, to, note }: { from: string; to: string | null; note?: string }) {
  return (
    <div className="pb-row">
      <span className="pb-from mono">{from}</span>
      <span className="pb-arr2">{Icon.arrow}</span>
      <span className={'pb-to mono' + (to ? '' : ' none')}>{to || 'entfällt'}</span>
      {note && <span className="pb-note">{note}</span>}
    </div>
  )
}

// Eine Ziel-ohne-Quelle-Zeile (Default/Eingabe noetig).
function AddRow({ to, note }: { to: string; note?: string }) {
  return (
    <div className="pb-row">
      <span className="pb-from mono">{to}</span>
      {note && <span className="pb-note">{note}</span>}
    </div>
  )
}

// Rendert einen Eimer, falls er Zeilen hat — sonst nichts.
function Bucket({ kind, label, cls, map }: { kind: BucketKind; label: string; cls: string; map: PortBucket }) {
  const rows: PortRow[] = kind === 'add' ? [] : map.rows.filter((r) => r.kind === kind)
  const adds = kind === 'add' ? map.adds || [] : []
  const count = rows.length + adds.length
  if (!count) return null
  return (
    <div className={'port-bucket ' + cls}>
      <div className="pb-head">
        {ICN[kind]}
        <h4>{label}</h4>
        <span className="pb-n">{count}</span>
      </div>
      {rows.map((r, i) => (
        <MapRow from={r.from} to={r.to} note={r.note} key={'r' + i} />
      ))}
      {adds.map((a, i) => (
        <AddRow to={a.to} note={a.note} key={'a' + i} />
      ))}
    </div>
  )
}

export function PortPanel({ artifactId }: PortPanelProps) {
  const ids = artifactId ? [artifactId] : Object.keys(portProfile.maps)
  return (
    <div className="port-panel">
      <div className="port-head">
        <div className="port-title">
          <b>Claude</b> <span className="pt-arr">{Icon.arrow}</span> <b>Codex</b>
        </div>
        <span className="port-prof" title="Gilt fuer diese Versionen">
          Profil v{portProfile.version} · CC {portProfile.validFor.claude} / Codex{' '}
          {portProfile.validFor.codex}
        </span>
      </div>
      <div className="port-intro">
        {Icon.note}
        <span>
          Portieren heißt <b>übersetzen</b>, nicht 1:1 kopieren. Jedes Feld ist klassifiziert —
          nichts wird stillschweigend geraten.
        </span>
      </div>
      {ids.map((id) => {
        const map = portProfile.maps[id]
        if (!map) return null
        return (
          <div className="port-art" key={id}>
            <div className="port-art-head">
              <b>{id}</b> <span className="pt-arr">{Icon.arrow}</span> {map.targetLabel}
            </div>
            {BUCKETS.map((b) => (
              <Bucket kind={b.kind} label={b.label} cls={b.cls} map={map} key={b.kind} />
            ))}
          </div>
        )
      })}
      <div className="port-foot">
        {Icon.snap}
        <span>
          <b>Weggelassenes</b> und <b>neue Ziel-Felder</b> musst du bestätigen. Ändert sich ein
          Format, meldet der Watcher „Profil veraltet" — und nur diese kleine Profil-Datei wird
          angefasst.
        </span>
      </div>
    </div>
  )
}
