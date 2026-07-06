import { useState } from 'react'
import type { DirCompare, DuplicateSet } from '@shared/contract'
import type { DirReconcileRequest } from '@shared/contract-write'
import { Icon } from '../../components/Icon'
import { useWriteConfig } from '../../state/store-write-config'
import { DirConfirmBlock, type DirAction, type DirDecisions, type DirFileDecisionValue } from './DirConfirmBlock'
import { CanonToggle, ReconcileButtons, OrdnerButtons, type Canon } from './DirReconcileButtons'
import { TRUNCATED, WRITE_AUS } from '@shared/dup-labels'
import { isPairDispatched, markPairDispatched } from './reconcile-dispatch'

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
  knownPaths: string[]
}

export function DirReconcileActions({ d, dir, knownPaths }: DirReconcileActionsProps) {
  const { busy, writeEnabled, writeReason, archiveDirEntry, moveDirEntry, reconcileFolder } =
    useWriteConfig()
  const [pending, setPending] = useState<DirAction | null>(null)
  const [moveTo, setMoveTo] = useState('')
  const [canon, setCanon] = useState<Canon>('trunk')
  const [decisions, setDecisions] = useState<DirDecisions>(() => buildDecisions(dir, 'keep-trunk'))

  function pickCanon(c: Canon) {
    setCanon(c)
    setDecisions(buildDecisions(dir, canonAction(c))) // Default-Richtung folgt dem Owner-Umschalter
  }

  // Reconcile-Aktion gewaehlt: Pro-Datei-Defaults an die echte Richtung anpassen
  // (adopt uebernimmt wirklich Inhalt, keep archiviert nur). Ordner-Aktionen
  // (archive/move) lassen die decisions unberuehrt.
  function pickAction(action: DirAction) {
    if (isReconcileDir(action)) setDecisions(buildDecisions(dir, action))
    setPending(action)
  }

  function cancel() {
    setPending(null)
    setMoveTo('')
    setDecisions(buildDecisions(dir, canonAction(canon)))
  }

  async function confirmAction() {
    const ok = await runAction(pending, moveTo, { d, decisions, archiveDirEntry, moveDirEntry, reconcileFolder })
    if (ok) cancel()
  }

  if (pending) {
    return (
      <DirConfirmBlock
        d={d}
        dir={dir}
        action={pending}
        moveTo={moveTo}
        onMoveTo={setMoveTo}
        knownPaths={knownPaths}
        decisions={decisions}
        onDecision={(rel, dec) => setDecisions((prev) => ({ ...prev, [rel]: dec }))}
        busy={busy}
        writeEnabled={writeEnabled}
        writeReason={writeReason}
        onCancel={cancel}
        onConfirm={confirmAction}
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
      onMoveTo={setMoveTo}
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
  onMoveTo(v: string): void
}

function ActionRow(p: ActionRowProps) {
  const { d, dir, busy, writeEnabled, writeReason, canon, onCanon, onPending, onMoveTo } = p
  const disabledTitle = !writeEnabled ? (writeReason ?? WRITE_AUS) : undefined
  const n = dir.files.length
  return (
    <div className="dup-row dup-dir-actions">
      <span className="dup-name mono">{d.name}</span>
      {dir.truncated && (
        <span className="dir-truncated">
          {Icon.note}
          {TRUNCATED.bulkHinweis}
        </span>
      )}
      <CanonToggle canon={canon} onCanon={onCanon} disabled={busy || !writeEnabled} />
      <div className="dup-btns">
        <ReconcileButtons canon={canon} busy={busy} writeEnabled={writeEnabled} disabledTitle={disabledTitle} onPending={onPending} />
        <OrdnerButtons name={d.name} n={n} busy={busy} writeEnabled={writeEnabled} disabledTitle={disabledTitle} onPending={onPending} onMoveTo={onMoveTo} />
      </div>
    </div>
  )
}

// ── Aktions-Ausführung (kein UI) ─────────────────────────────────────────────

interface RunDeps {
  d: DuplicateSet
  decisions: DirDecisions
  archiveDirEntry(path: string): Promise<boolean>
  moveDirEntry(path: string, to: string): Promise<boolean>
  reconcileFolder(req: DirReconcileRequest): Promise<boolean>
}

async function runAction(pending: DirAction | null, moveTo: string, deps: RunDeps): Promise<boolean> {
  if (!pending) return false
  const { d, decisions, archiveDirEntry, moveDirEntry, reconcileFolder } = deps
  switch (pending) {
    case 'archive-dir':
      return archiveDirEntry(d.trunk.path)
    case 'archive-mirror':
      return archiveDirEntry(d.mirror.path)
    case 'move-dir':
      return moveTo.trim() ? moveDirEntry(d.trunk.path, moveTo.trim()) : false
    case 'move-mirror':
      return moveTo.trim() ? moveDirEntry(d.mirror.path, moveTo.trim()) : false
    case 'keep-trunk':
    case 'keep-mirror':
    case 'adopt-mirror':
    case 'adopt-trunk':
      return runReconcileOnce(d, decisions, reconcileFolder)
  }
}

// F7-Idempotenz fuer den Ordner-Reconcile (Bulk je Eintrag): ein gespiegeltes
// physisches Paar (trunk/mirror) wird nur EINMAL eingearbeitet. Zweiter Dispatch
// = deterministisches no-op (true), MAIN backt das mit 'already-reconciled' ab.
async function runReconcileOnce(
  d: DuplicateSet,
  decisions: DirDecisions,
  reconcileFolder: (req: DirReconcileRequest) => Promise<boolean>
): Promise<boolean> {
  if (isPairDispatched(d.trunk.path, d.mirror.path)) return true
  const ok = await reconcileFolder(buildReconcileReq(d, decisions))
  if (ok) markPairDispatched(d.trunk.path, d.mirror.path)
  return ok
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
