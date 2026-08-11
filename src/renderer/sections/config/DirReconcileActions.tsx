import { useState } from 'react'
import type { DirCompare, DuplicateSet } from '@shared/contract'
import type { DirReconcileRequest } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { OpProgress } from '../../components/OpProgress'
import { useStore } from '../../state/store'
import { useWriteConfig } from '../../state/store-write-config'
import { DirConfirmBlock, type DirAction, type DirDecisions, type DirFileDecisionValue } from './DirConfirmBlock'
import { CanonToggle, ReconcileButtons, OrdnerButtons, type Canon } from './DirReconcileButtons'
import { ReconcilePlanSummary } from './ReconcilePlanSummary'
import { mergeButtonLabel, useMergePlan } from './use-merge-plan'
import { TRUNCATED, WRITE_AUS, intraAktionTexte, isIntraFamilyDup } from '@shared/dup-labels'

// DirReconcileActions — Ordner-Aktions-Komponente (HR27-Split: Confirm/Decisions in
// DirConfirmBlock.tsx, Button-Reihen in DirReconcileButtons.tsx). SYMMETRISCH
// (Finding B): ein „Welche Version bleibt?"-Umschalter (Shared|Claude) bestimmt die
// Default-Pro-Datei-Entscheidung UND die Bulk-Richtung — KEIN Shared-Bias.
// Code-interne Aktions-Typnamen: keep-trunk/keep-mirror/adopt-mirror/adopt-trunk,
// archive-dir/move-dir/archive-mirror/move-mirror. SICHTBARE Texte aus @shared/dup-labels.
// Schreibzugriff ausschliesslich über Bridge (window.electronAPI via useWriteConfig).

interface DirReconcileActionsProps {
  d: DuplicateSet
  dir: DirCompare
}

export function DirReconcileActions({ d, dir }: DirReconcileActionsProps) {
  const { busy, writeEnabled, writeReason, archiveDirEntry, moveDirEntry } = useWriteConfig()
  const [pending, setPending] = useState<DirAction | null>(null)
  const [canon, setCanon] = useState<Canon>('trunk')
  const [decisions, setDecisions] = useState<DirDecisions>(() => buildDecisions(dir, 'keep-trunk'))
  const merge = useMergePlan(d)

  function pickCanon(c: Canon) {
    setCanon(c)
    setDecisions(buildDecisions(dir, canonAction(c))) // Default-Richtung folgt dem Owner-Umschalter
    merge.reset() // Auswahl geaendert -> alter Plan passt nicht mehr zum Gezeigten
  }

  // Reconcile-Aktion gewaehlt: Pro-Datei-Defaults an die echte Richtung anpassen
  // (adopt uebernimmt wirklich Inhalt, keep archiviert nur). Ordner-Aktionen
  // (archive/move) lassen die decisions unberuehrt.
  function pickAction(action: DirAction) {
    if (isReconcileDir(action)) setDecisions(buildDecisions(dir, action))
    merge.reset()
    setPending(action)
  }

  function setDecision(rel: string, dec: DirFileDecisionValue) {
    setDecisions((prev) => ({ ...prev, [rel]: dec }))
    merge.reset() // geaenderte Zuordnung => neue Vorschau noetig (planHash)
  }

  function cancel() {
    setPending(null)
    setDecisions(buildDecisions(dir, canonAction(canon)))
    merge.reset()
  }

  // Ordner-Merge laeuft ueber zwei Klicks (Preview -> Apply gegen planHash),
  // Archivieren/Verschieben bleiben einstufig wie bisher.
  async function confirmAction() {
    if (pending && isReconcileDir(pending)) {
      if (await merge.step(buildReconcileReq(d, decisions))) cancel()
      return
    }
    const ok = await runAction(pending, { d, archiveDirEntry, moveDirEntry })
    if (ok) cancel()
  }

  if (pending) {
    const isMerge = isReconcileDir(pending)
    return (
      <DirConfirmBlock
        d={d}
        dir={dir}
        action={pending}
        decisions={decisions}
        onDecision={setDecision}
        busy={busy || merge.busy}
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        onCancel={cancel}
        onConfirm={confirmAction}
        planBlock={isMerge ? <ReconcilePlanSummary plan={merge.plan} error={merge.error} /> : null}
        confirmLabel={isMerge ? mergeButtonLabel(merge.plan) : undefined}
        confirmBlocked={isMerge && merge.blocked}
        // Fortschritt nur beim eigentlichen Speichern (Plan liegt vor + laeuft).
        progressBlock={
          <OpProgress
            active={isMerge && merge.busy && merge.plan !== null}
            operationIds={merge.plan ? [merge.plan.operationId] : []}
          />
        }
      />
    )
  }

  return (
    <ActionRow
      d={d}
      dir={dir}
      busy={busy}
      writeEnabled={writeEnabled}
      writeReason={writeReason}
      canon={canon}
      onCanon={pickCanon}
      onPending={pickAction}
    />
  )
}

// ── Aktions-Zeile (sichtbare Buttons) ────────────────────────────────────────

interface ActionRowProps {
  d: DuplicateSet
  dir: DirCompare
  busy: boolean
  writeEnabled: boolean
  writeReason: string | null
  canon: Canon
  onCanon(c: Canon): void
  onPending(a: DirAction): void
}

function ActionRow(p: ActionRowProps) {
  const { d, dir, busy, writeEnabled, writeReason, canon, onCanon, onPending } = p
  const { ui } = useStore()
  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined
  const n = dir.files.length
  // Intra-Familien-Paar: ehrliche Fassungs-Texte fuer Umschalter + Reconcile-
  // Knoepfe statt „Shared"/„deine Kopie" — nur Beschriftung, Mechanik gleich.
  const intra = isIntraFamilyDup(d, ui.llm) ? intraAktionTexte(d.trunk.path, d.mirror.path) : null
  return (
    <div className="dup-row dup-dir-actions">
      <span className="dup-name mono">{d.name}</span>
      {dir.truncated && (
        <span className="dir-truncated">
          {Icon.note}
          {TRUNCATED.bulkHinweis}
        </span>
      )}
      <CanonToggle canon={canon} onCanon={onCanon} disabled={busy || !writeEnabled} intra={intra} />
      <div className="dup-btns">
        <ReconcileButtons canon={canon} busy={busy} writeEnabled={writeEnabled} disabledTitle={disabledTitle} onPending={onPending} intra={intra} />
        <OrdnerButtons name={d.name} n={n} busy={busy} writeEnabled={writeEnabled} disabledTitle={disabledTitle} onPending={onPending} />
      </div>
    </div>
  )
}

// ── Aktions-Ausführung (kein UI) ─────────────────────────────────────────────

interface RunDeps {
  d: DuplicateSet
  archiveDirEntry(path: string): Promise<boolean>
  moveDirEntry(path: string): Promise<boolean>
}

// Ganz-Ordner-Aktionen (einstufig). Der Ordner-Merge laeuft NICHT hier, sondern
// zweistufig ueber useMergePlan (Vorschau -> Ausfuehren gegen planHash). Beim
// Verschieben waehlt der Owner das Ziel im nativen Main-Ordnerdialog (Sicherheit
// Finding A) — der Renderer gibt kein Ziel mehr mit.
async function runAction(pending: DirAction | null, deps: RunDeps): Promise<boolean> {
  if (!pending) return false
  const { d, archiveDirEntry, moveDirEntry } = deps
  switch (pending) {
    case 'archive-dir':
      return archiveDirEntry(d.trunk.path)
    case 'archive-mirror':
      return archiveDirEntry(d.mirror.path)
    case 'move-dir':
      return moveDirEntry(d.trunk.path)
    case 'move-mirror':
      return moveDirEntry(d.mirror.path)
    default:
      return false // Merge-Richtungen: siehe useMergePlan (Zwei-Klick-Weg)
  }
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

// Reconcile-Richtungen (Pro-Datei-Entscheidung ohne skip/archive/move).
type ReconcileDir = 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk'

function isReconcileDir(action: DirAction): action is ReconcileDir {
  return (
    action === 'keep-trunk' ||
    action === 'keep-mirror' ||
    action === 'adopt-mirror' ||
    action === 'adopt-trunk'
  )
}

// Default-Richtung des Owner-Umschalters: welche Seite by default bleibt.
function canonAction(canon: Canon): ReconcileDir {
  return canon === 'trunk' ? 'keep-trunk' : 'keep-mirror'
}

// Pro-Datei-Default fuer die gewaehlte Aktion. WICHTIG (Dedup-Fix): AUCH
// identische Dateien bekommen einen Eintrag -> ein Duplikat-Ordner wird
// dedupliziert (Verliererseite HR7-archiviert), auch bei gleichem Inhalt — kein
// Datenverlust, der identische Inhalt bleibt auf der Gewinnerseite + im Archiv.
// Bei IDENTISCHEM Inhalt ist adopt sinnlos (kein Copy noetig) -> auf reines keep
// der Gewinnerseite reduziert (kein ueberfluessiger Pre-Snapshot). Secret-Dateien
// bleiben aussen vor -> secret-skip in MAIN (HR24). status: 'same' | 'diff' | 'only*'.
function decisionForFile(action: ReconcileDir, status: string): DirFileDecisionValue {
  const trunkWins = action === 'keep-trunk' || action === 'adopt-mirror'
  if (status === 'same') return trunkWins ? 'keep-trunk' : 'keep-mirror'
  return action
}

// Pro-Datei-Entscheidungen fuer eine Aktion bauen (alle nicht-secret Dateien,
// inkl. identischer — Dedup). Secret bleibt unentschieden (MAIN secret-skip).
function buildDecisions(dir: DirCompare, action: ReconcileDir): DirDecisions {
  const d: DirDecisions = {}
  for (const f of dir.files) {
    if (!f.secret) d[f.rel] = decisionForFile(action, f.status)
  }
  return d
}

function buildReconcileReq(d: DuplicateSet, decisions: DirDecisions): DirReconcileRequest {
  return { trunkPath: d.trunk.path, mirrorPath: d.mirror.path, decisions }
}
