import { useState } from 'react'
import type { DriftMember, DriftRelation } from '@shared/contract-drift'
import { driftRelationKey } from '@shared/contract-drift'
import { Icon } from '../../components/Icon'
import {
  DRIFT_DUPLICATE,
  DRIFT_ROOTKIND,
  DRIFT_STATUS,
  DRIFT_VERGLEICH,
  DRIFT_VORSCHLAG,
  driftDecisionBadge
} from '@shared/drift-labels'
import { DriftClassify } from './DriftClassify'
import { DriftPairView } from './DriftPairView'
import { DriftReconcile } from './DriftReconcile'

// Ein klappbarer Drift-Eintrag (Muster DupEntry): Kopf mit Name + Kategorie-
// Chip + Status-Badge + Root-Chips + Vorschlags-/Festlegungs-Badge; Koerper
// mit Mitglieder-Liste, paarweisem Vergleich (DiffView-Bausteine) und den
// Klassifizierungs-Buttons. Bei decision='duplicate' zusaetzlich der Hinweis
// und der bestehende Reconcile-Pfad fuer das gewaehlte Paar.

export function DriftEntry({ rel, startOpen, dimmed }: { rel: DriftRelation; startOpen: boolean; dimmed: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const [pair, setPair] = useState<[number, number]>([0, 1])
  const key = driftRelationKey(rel.cat, rel.name, rel.members.map((m) => m.rootKind))
  const a = rel.members[pair[0]]
  const b = rel.members[pair[1]] ?? rel.members[0]
  return (
    <div className={'dup-entry' + (open ? ' open' : '')} style={dimmed ? { opacity: 0.6 } : undefined}>
      <button type="button" className="dup-entry-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={'chev-btn' + (open ? ' open' : '')}>{Icon.chev}</span>
        <span className="deh-icon">{Icon.diff}</span>
        <span className="deh-main">
          <span className="deh-name">
            <span className="deh-fname mono">{rel.name}</span>
            <span className="deh-fam">{rel.cat}</span>
            {rel.members.map((m) => (
              <span key={m.rootKind} className="deh-fam">
                {DRIFT_ROOTKIND[m.rootKind]}
              </span>
            ))}
          </span>
          <span className="deh-desc">
            {rel.suggestion === 'parity' && !rel.decision ? DRIFT_VORSCHLAG : ''}
            {rel.decision ? driftDecisionBadge(rel.decision) : ''}
          </span>
        </span>
        <span className="deh-meta">
          <span className={'pill ' + (rel.status === 'same' ? 'same' : 'abw')}>
            <span className="pd" />
            {DRIFT_STATUS[rel.status]}
          </span>
        </span>
      </button>
      {open && (
        <div className="dup-entry-body">
          <MemberList members={rel.members} pair={pair} onPick={setPair} />
          <DriftPairView a={a} b={b} />
          {rel.decision === 'duplicate' && <div className="diff-secret-note">{DRIFT_DUPLICATE.hinweis}</div>}
          <DriftClassify driftKey={key} decision={rel.decision} />
          {rel.decision === 'duplicate' && <DriftReconcile a={a} b={b} />}
        </div>
      )}
    </div>
  )
}

// Mitglieder-Liste: Pfad (fuer autorisierte lokale Nutzer sichtbar, kein
// Masking), Root-Art, Aenderungsdatum. Zwei Member waehlen das Vergleichspaar.
function MemberList({
  members,
  pair,
  onPick
}: {
  members: DriftMember[]
  pair: [number, number]
  onPick(pair: [number, number]): void
}) {
  return (
    <div className="dir-files">
      <div className="deh-desc">
        {DRIFT_VERGLEICH.mitglieder} · {DRIFT_VERGLEICH.paarWaehlen}
      </div>
      {members.map((m, i) => (
        <label key={m.rootKind} className="dir-file-row">
          <input
            type="checkbox"
            checked={pair.includes(i)}
            onChange={() => onPick(nextPair(pair, i))}
            disabled={!pair.includes(i) && pair.length >= 2}
          />
          <span className="deh-fam">{DRIFT_ROOTKIND[m.rootKind]}</span>
          <span className="dir-rel mono">{m.path}</span>
          {m.updated && (
            <span className="deh-desc">
              {DRIFT_VERGLEICH.aktualisiert}: {m.updated}
            </span>
          )}
        </label>
      ))}
    </div>
  )
}

// Paar-Auswahl: Klick auf ein gewaehltes Mitglied loest es, Klick auf ein
// freies ersetzt das aelteste — es bleiben immer genau zwei gewaehlt.
function nextPair(pair: [number, number], i: number): [number, number] {
  if (pair.includes(i)) return pair
  return [pair[1], i]
}
