// contract-write-reconcile.ts — Reconcile-/DirReconcile-Typen + Sentinel.
// Aus contract-write.ts ausgelagert (HR27: contract-write.ts bleibt <300 Z).
// Reine Type-Deklarationen + ein Sentinel-Const, KEINE Laufzeit-Logik.
// Secrets werden NIE getragen — nur Namen/Pfade/Status.
import type { IpcResult } from './contract'

// ── F7-Idempotenz-Sentinel (kanonische EINE Quelle, WP-10) ───────────────
// Deterministischer error-Wert, den eine zweite reconcile-Aktion auf ein bereits
// eingearbeitetes/gespiegeltes Paar zurueckgibt. KEIN echter Fehler — die UI mappt
// das auf „schon erledigt" (no-op), nicht auf rot. Bewusst hier (Type-SSoT, ohne
// node:fs/Main-Modul), damit MAIN (reconcile-folder.ts) UND Renderer
// (store-write-config.tsx) denselben Wert importieren statt je ein Literal zu fuehren.
export const ALREADY_RECONCILED = 'already-reconciled'

// ── Reconcile (Teil B) ───────────────────────────────────────────────────
// Diff praesentieren + Owner-Entscheidung; KEIN Auto-Merge. Owner entscheidet
// pro Datei-Paar, WELCHE Seite ueberlebt (SYMMETRISCH, Finding B — wie der
// Ordner-Reconcile). Die Verlierer-Seite wird vor edit pre-snapshottet/archiviert.
// Identisch zu DirFileDecision ohne 'skip' (Einzeldatei kennt kein skip).
//   'keep-trunk'   = Trunk bleibt; Mirror wird archiviert.
//   'keep-mirror'  = Mirror bleibt; Trunk wird archiviert (Spiegel zu keep-trunk).
//   'adopt-mirror' = Mirror-Inhalt in Trunk uebernehmen (Trunk-Pre-Snapshot), Mirror archivieren.
//   'adopt-trunk'  = Trunk-Inhalt in Mirror uebernehmen (Mirror-Pre-Snapshot), Trunk archivieren.
export type ReconcilePairDecision = 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk'

export interface ReconcileRequest {
  trunkPath: string
  mirrorPath: string
  decision: ReconcilePairDecision
}

export interface ReconcileResultData {
  trunkPath: string
  // Pfad der archivierten VERLIERER-Seite (HR7) — Mirror bei keep-trunk/adopt-mirror,
  // Trunk bei keep-mirror/adopt-trunk. Feldname trunk-/mirror-historisch (internes,
  // sanitisiertes Result, nie angezeigt); Semantik ist seiten-neutral „Verlierer".
  mirrorArchivedTo: string | null
  // Pre-Snapshot der UEBERSCHRIEBENEN Seite bei adopt (Trunk bei adopt-mirror,
  // Mirror bei adopt-trunk). null bei keep-* (kein edit).
  trunkBackupPath: string | null
  decision: ReconcilePairDecision
}

export type ReconcileResult = IpcResult<ReconcileResultData>

// ── Dir-Reconcile (Ordner-Merge, Teil A — CONTRACT-SSoT) ─────────────────
// Ordner-Merge: zwei Verzeichnisse zu einem zusammenfuehren (Pro-Datei).
// SYMMETRISCH (Finding B): pro Datei kann WAHLWEISE die Trunk- ODER die Mirror-
// Seite ueberleben; die jeweils andere Seite wird archiviert (HR7, kein Loeschen).
// decisions: rel-POSIX-Pfad -> Entscheidung je Datei (Daten-/Code-Werte trunk/
// mirror; sichtbare UI-Texte nutzen Shared/Claude, nie Trunk/Mirror).
//   'keep-trunk'   = Trunk-Datei bleibt; Mirror-Datei wird archiviert.
//   'keep-mirror'  = Mirror-Datei bleibt; Trunk-Datei wird archiviert (Spiegel zu keep-trunk).
//   'adopt-mirror' = Mirror-Inhalt in Trunk uebernehmen (backup-first), Mirror archivieren.
//   'adopt-trunk'  = Trunk-Inhalt in Mirror uebernehmen (backup-first), Trunk archivieren (Spiegel zu adopt-mirror).
//   'skip'         = weder noch (Datei wird nicht beruehrt).
// Dateien ohne decisions-Eintrag -> implizit 'skip'.
export type DirFileDecision = 'keep-trunk' | 'keep-mirror' | 'adopt-mirror' | 'adopt-trunk' | 'skip'

export interface DirReconcileRequest {
  trunkPath: string
  mirrorPath: string
  decisions: Record<string, DirFileDecision>
}

// Pro-Datei-Ergebnis im Merge-Report.
export interface DirFileReconcileEntry {
  rel: string
  decision: DirFileDecision | 'secret-skip' | 'error'
  backupPath?: string | null
  archivedTo?: string | null // Pfad der archivierten Verlierer-Seite (HR7), wenn vorhanden
  error?: string
}

export interface DirReconcileResultData {
  trunkPath: string
  // Gesetzt, wenn der GANZE Mirror-Ordner als Ganzes archiviert wurde (Sonderfall:
  // alle Dateien keep-trunk + kein adopt offen). Bei gemischten/symmetrischen
  // Entscheidungen bleibt das Feld null; die Verlierer-Seite je Datei steht in
  // DirFileReconcileEntry.archivedTo. null auch wenn Merge abgebrochen wurde.
  mirrorArchivedTo: string | null
  files: DirFileReconcileEntry[]
  partial: boolean // true wenn Merge vor Abschluss abgebrochen wurde
}

export type DirReconcileResult = IpcResult<DirReconcileResultData>
