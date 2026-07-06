// contract-integrity.ts — Typen für die Integrity-Transaktionsschicht (W1).
// Reine Type-Deklarationen + ein Sentinel, KEINE Laufzeit-Logik.
// Secrets werden NIE getragen — nur Pfade/Status/Codes.
// Importiert von Preload (IntegrityApi), Main-Handlern und Renderer-Slices.
import type { IpcResult } from './contract'
import type { MoveVersionedRequest, RenameRequest } from './contract-write-rename'
import type { ReconcileRequest, DirReconcileRequest } from './contract-write-reconcile'

// ── Grundtypen ────────────────────────────────────────────────────────────

/** Art der Integritäts-Transaktion. */
export type IntegrityKind = 'move' | 'rename' | 'reconcile' | 'reconcile-folder'

/** Art einer geplanten Referenz-Rewrite-Operation. */
export type ReferenceOpKind =
  | 'path'
  | 'wikilink'
  | 'governance-dependency'
  | 'loader-default'

// ── Geplante Referenz-Rewrite-Operation ───────────────────────────────────

/** Eine geplante atomare Referenz-Umschreibung in einer Datei. */
export interface ReferenceOp {
  filePath: string
  rel?: string               // relativer Pfad (bei Wikilink-Bezug)
  kind: ReferenceOpKind
  field?: string             // Feld-Schlüssel (bei structured-Dateien)
  line?: number              // 1-basierte Zeilennummer (Hinweis, kein stabiler Anker)
  oldValue: string
  newValue: string
}

// ── Blocker ────────────────────────────────────────────────────────────────

/** Kodes für nicht automatisch auflösbare Blocker. */
export type IntegrityBlockerCode =
  | 'ambiguous-wikilink'
  | 'secret-skip'
  | 'oversize'
  | 'binary'
  | 'truncated'
  | 'cross-volume-rollback-not-proven'
  | 'out-of-scope'
  | 'scope-ambiguous'       // D022: Scope-Wechsel
  | 'plan-hash-mismatch'
  | 'plan-token-mismatch'

/** Ein Blocker, der manuelles Owner-Handeln erfordert. */
export interface IntegrityBlocker {
  code: IntegrityBlockerCode
  path?: string
  reason: string             // Klartext, kein Secret-Wert
}

// ── Manuell-Required ──────────────────────────────────────────────────────

/**
 * Rest-Eintrag, der NICHT als clean verkauft werden darf (Secret-Reste,
 * mehrdeutige Wikilinks, oversize- oder binary-Dateien). NIE rohe Wert-Snippets.
 */
export interface ManualRequiredItem {
  filePath: string
  line?: number
  reason: string             // Klartext, kein Secret-Wert
}

// ── Filesystem-Operation ──────────────────────────────────────────────────

/** Eine geplante Filesystem-Aktion (Move, Reconcile). */
export interface IntegrityFsOp {
  action: 'move' | 'move-dir' | 'reconcile' | 'reconcile-folder'
  from: string
  to?: string
  ownerMove?: boolean         // true: nur Ziel-Scope fuer Owner-Move freigeben
  isDir?: boolean
  decision?: string          // z.B. ReconcilePairDecision-Wert
  rel?: string               // relativer Pfad bei Ordner-Merge
}

// ── Plan ──────────────────────────────────────────────────────────────────

/**
 * Vollständiger Integritäts-Plan: wird vom Preview erzeugt, vom Apply
 * konsumiert. planHash sichert, dass Apply nur gegen den bestätigten Plan läuft.
 */
export interface IntegrityPlan {
  operationId: string
  planHash: string
  previewToken?: string       // Main-signierter Preview-Nachweis, kein Secret-Wert
  kind: IntegrityKind
  fsOps: IntegrityFsOp[]
  referenceOps: ReferenceOp[]
  blockers: IntegrityBlocker[]
  manualRequired: ManualRequiredItem[]
  scannedFiles: number
  truncated: boolean         // true wenn Scan-Limit erreicht (Plan unvollständig)
}

// ── Journal-Typen (type-only; Runtime in journal.ts) ──────────────────────

/** Phase einer Transaktions-Journalisierung. */
export type JournalPhase = 'snapshot' | 'fs' | 'reference' | 'verify' | 'rollback'

/** Welche Rollback-Aktion für einen Journal-Eintrag registriert ist. */
export type RollbackAction = 'restore-snapshot' | 'reverse-move' | 'none'

/** Rollback-Gesamtstatus einer Transaktion. */
export type RollbackStatus = 'none' | 'rolled-back' | 'rollback-failed' | 'pending'

/** Ein atomarer Journal-Eintrag pro Schritt/Datei. */
export interface JournalEntry {
  operationId: string
  phase: JournalPhase
  path: string
  kind: string
  beforeHash?: string
  afterHash?: string
  snapshotPath?: string
  rollbackAction: RollbackAction
  rollbackStatus: RollbackStatus
  error?: string
}

// ── Preview (Kanal integrity:preview) ─────────────────────────────────────

/**
 * Diskriminiertes Union über die vier Operationsarten.
 * Importiert die bestehenden Request-Typen als einzige Eingabe-Beschreibung.
 */
export type IntegrityPreviewRequest =
  | { kind: 'move';             req: MoveVersionedRequest }
  | { kind: 'rename';           req: RenameRequest }
  | { kind: 'reconcile';        req: ReconcileRequest }
  | { kind: 'reconcile-folder'; req: DirReconcileRequest }

/** Ergebnis des Preview-Schritts: der vollständige Plan oder ein Fehler. */
export type IntegrityPreviewResult = IpcResult<IntegrityPlan>

// ── Apply (Kanal integrity:apply) ──────────────────────────────────────────

/**
 * Apply-Anfrage: nur mit bestätigtem Plan-Hash gültig.
 * Verhindert Ausführung eines veralteten oder manipulierten Plans.
 */
export interface IntegrityApplyRequest {
  plan: IntegrityPlan
  planHash: string
}

/**
 * Apply-Ergebnis: entweder sauber applied (rolledBack=false) ODER vollständig
 * zurückgerollt (rolledBack=true). Kein partial=true-Grün-Erfolg.
 */
export interface IntegrityApplyData {
  applied: boolean
  partial: false              // nie partial: Entweder clean ODER rolledBack
  operationId: string
  kind: IntegrityKind
  rewrittenFiles: string[]
  movedTo?: string
  journalPath?: string       // Pfad der persistierten Journal-Datei
  rolledBack: boolean
  rollbackStatus: RollbackStatus
  manualRequired: ManualRequiredItem[]
}

/** Sanitisiertes IPC-Ergebnis des Apply-Schritts. */
export type IntegrityApplyResult = IpcResult<IntegrityApplyData>

// ── Bridge-Vertrag (analog WriteApi/ElectronApi) ──────────────────────────

/**
 * IntegrityApi — Preload-Bridge-Vertrag für die Integrity-Transaktionsschicht.
 * Wird via Intersection in env.d.ts / Preload zu window.electronAPI addiert.
 */
export interface IntegrityApi {
  integrityPreview(req: IntegrityPreviewRequest): Promise<IntegrityPreviewResult>
  integrityApply(req: IntegrityApplyRequest): Promise<IntegrityApplyResult>
}
