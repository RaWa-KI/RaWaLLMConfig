import { useMemo, useState } from 'react'
import type { DiffLabels, DuplicateSet } from '@shared/contract'
import type { ReconcileRequest } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import {
  PILL,
  UEBERNEHMEN,
  UEBERNEHMEN_TRUNK,
  BEHALTEN,
  BEHALTEN_MIRROR,
  WRITE_AUS,
  seiteForFamily
} from '@shared/dup-labels'
import { useReconcile } from '../../state/store-write-reconcile'
import { useWriteConfig } from '../../state/store-write-config'
import { buildKnownPaths } from './known-paths'
import { CanonToggle, type Canon } from './DirReconcileButtons'
import { DiffView } from './DiffView'
import { DupRowActions } from './DupRowActions'
import { DupRowRename } from './DupRowRename'
import { FilePairConfirm } from './DuplicateFileConfirm'
import { isPairDispatched, markPairDispatched } from './reconcile-dispatch'

// DuplicateFilePair (HR27-Split aus DuplicatePanel.tsx, WP-10) — Einzeldatei-Paar
// als Datei-Tabelle mit EINER Zeile (Owner-Entscheid: einheitlicher Aufbau zur
// Ordner-Ansicht). Sichtbare Texte ausschliesslich aus shared/dup-labels.ts;
// Trunk/Mirror/Merge/M2 sind im UI verboten. ECHTE Pfade je Seite: trunk=Shared,
// mirror=Claude (nie d.name). F7-Idempotenz: ein gespiegeltes Paar wird nur EINMAL
// eingearbeitet (reconcile-dispatch.ts).

type Decision = ReconcileRequest['decision']

// Einzeldatei-Paar als .dir-files/.dir-file-Zeile: Status-Badge + LIVE-Aktionen
// (Stift/Verschieben/Mehr, WP-08); Aufklappen zeigt den editierbaren Paar-Diff
// (DiffView, WP-05). Reconcile-Aktionen (Datei-Pfad) liegen unter der Tabelle.
export function FilePairEntry({ d, labels }: { d: DuplicateSet; labels?: DiffLabels }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="dir-files">
        <div className={'dir-file' + (open ? ' open' : '')}>
          <FilePairRow d={d} open={open} onToggle={() => setOpen((v) => !v)} />
          {open && (
            <div className="dup-file-drill">
              <DiffView dups={[d]} labels={labels} />
            </div>
          )}
        </div>
      </div>
      <FilePairActions d={d} />
    </>
  )
}

// Die EINE Datei-Zeile des Einzeldatei-Paars (v4 .dir-file-row). Stift oeffnet
// Inline-Rename (ersetzt die Zeile), Verschieben/Mehr ueber DupRowActions. ECHTE
// Pfade je Seite: trunk=Shared, mirror=Claude (nie d.name).
function FilePairRow({ d, open, onToggle }: { d: DuplicateSet; open: boolean; onToggle(): void }) {
  const { config, ui } = useStore()
  const knownPaths = useMemo(() => buildKnownPaths(config.data, ui.llm, ''), [config.data, ui.llm])
  const [renaming, setRenaming] = useState(false)
  const same = d.verdict === 'same'
  const rel = fileName(d.trunk.path) || fileName(d.mirror.path) || d.name
  if (renaming) {
    return (
      <div className="dir-file-row">
        <DupRowRename currentName={rel} sharedPath={d.trunk.path} claudePath={d.mirror.path} kind="Datei" onDone={() => setRenaming(false)} />
      </div>
    )
  }
  return (
    <div className="dir-file-row">
      <button type="button" className="dir-file-head" onClick={onToggle} aria-expanded={open}>
        <span className={'dir-chev' + (open ? ' open' : '')}>{Icon.chev}</span>
        <span className="dir-file-level">Datei</span>
        <span className="dir-rel mono">{rel}</span>
        <span className={'dir-badge ' + (same ? 'same' : 'diff')}>{same ? PILL.same : PILL.diff}</span>
      </button>
      <DupRowActions
        name={rel}
        kind="Datei"
        sharedPath={d.trunk.path}
        claudePath={d.mirror.path}
        knownPaths={knownPaths}
        onStartRename={() => setRenaming(true)}
      />
    </div>
  )
}

// Datei-Reconcile-Aktionen (Uebernehmen / Behalten) fuer ein Einzeldatei-Paar.
// Nur bei verdict='diff' sinnvoll; identische Paare brauchen keine Aktion.
// SYMMETRISCH (Finding B, wie der Ordner-Reconcile): ein „Welche Version bleibt?"-
// Umschalter (Shared|Claude) polt die Default-/Bulk-Richtung um — KEIN Shared-Bias.
// F7-Idempotenz: ein bereits dispatchtes physisches Paar (gespiegelt je Familie)
// loest keine zweite Aktion mehr aus — der Knopf zeigt sich als „schon erledigt".
function FilePairActions({ d }: { d: DuplicateSet }) {
  const { busy, run } = useReconcile()
  const { writeEnabled, writeReason } = useWriteConfig()
  const [pending, setPending] = useState<Decision | null>(null)
  const [canon, setCanon] = useState<Canon>('trunk')
  // diff = beide Richtungen (behalten + übernehmen). same = nur deduplizieren
  // (eine Kopie behalten, andere HR7-archivieren; Inhalt identisch -> kein adopt).
  // Andere Verdicts (einseitig) haben keinen Paar-Reconcile -> keine Aktion.
  if (d.verdict !== 'diff' && d.verdict !== 'same') return null
  const isSame = d.verdict === 'same'

  const alreadyDone = isPairDispatched(d.trunk.path, d.mirror.path)
  // canon='trunk': Shared ueberlebt -> Uebernehmen=adopt-mirror, Behalten=keep-trunk.
  // canon='mirror': Claude/Kopie ueberlebt -> Uebernehmen=adopt-trunk, Behalten=keep-mirror.
  const adopt: Decision = canon === 'trunk' ? 'adopt-mirror' : 'adopt-trunk'
  const keep: Decision = canon === 'trunk' ? 'keep-trunk' : 'keep-mirror'

  const confirm = async () => {
    if (!pending) return
    // Zweiter Dispatch auf dasselbe gespiegelte Paar = no-op (nur EINMAL).
    if (isPairDispatched(d.trunk.path, d.mirror.path)) {
      setPending(null)
      return
    }
    const ok = await run({ trunkPath: d.trunk.path, mirrorPath: d.mirror.path, decision: pending })
    if (ok) {
      markPairDispatched(d.trunk.path, d.mirror.path)
      setPending(null)
    }
  }
  if (pending) {
    return (
      <FilePairConfirm
        d={d}
        decision={pending}
        busy={busy}
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
      />
    )
  }
  return (
    <FilePairButtonRow
      name={d.name}
      canon={canon}
      onCanon={setCanon}
      showAdopt={!isSame}
      dis={busy || !writeEnabled || alreadyDone}
      canonDis={busy || !writeEnabled}
      disabledTitle={!writeEnabled ? (writeReason ?? WRITE_AUS) : undefined}
      onAdopt={() => setPending(adopt)}
      onKeep={() => setPending(keep)}
    />
  )
}

// Präsentations-Knopfzeile fuer das Einzeldatei-Paar (HR27-Split aus
// FilePairActions). Umschalter (Shared|Claude) + Übernehmen (mit Pfeil) / Behalten
// (ohne Pfeil), spiegelbildlich je canon-Richtung; Texte seite-/canon-parametrisiert.
interface FilePairButtonRowProps {
  name: string
  canon: Canon
  onCanon(c: Canon): void
  showAdopt: boolean
  dis: boolean
  canonDis: boolean
  disabledTitle: string | undefined
  onAdopt(): void
  onKeep(): void
}

function FilePairButtonRow({ name, canon, onCanon, showAdopt, dis, canonDis, disabledTitle, onAdopt, onKeep }: FilePairButtonRowProps) {
  const { ui } = useStore()
  const seite = seiteForFamily(ui.llm)
  const adoptLbl = canon === 'trunk' ? UEBERNEHMEN(seite) : UEBERNEHMEN_TRUNK(seite)
  const keepLbl = canon === 'trunk' ? BEHALTEN(seite) : BEHALTEN_MIRROR(seite)
  return (
    <div className="dup-row">
      <span className="dup-name mono">{name}</span>
      <CanonToggle canon={canon} onCanon={onCanon} disabled={canonDis} />
      <div className="dup-btns">
        {showAdopt && (
          <button type="button" className="dup-btn adopt" onClick={onAdopt} disabled={dis} title={disabledTitle ?? adoptLbl.wirkung}>
            {Icon.arrow}
            {adoptLbl.titel}
          </button>
        )}
        <button type="button" className="dup-btn keep" onClick={onKeep} disabled={dis} title={disabledTitle ?? keepLbl.wirkung}>
          {Icon.archive}
          {keepLbl.titel}
        </button>
      </div>
    </div>
  )
}

// Letzter Datei-Pfadname (rel-Anzeige) — Trenner '/' oder '\' robust.
function fileName(p: string | undefined): string {
  if (!p) return ''
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] ?? ''
}
