// Write-Datenmodell (Phase 2) — Single Source of Truth fuer ALLE Schreib-/Edit-
// Typen. Teil A besitzt diese Datei allein; B/C/D fassen sie NIE an (nur Import).
// Reine Type-Deklarationen, KEINE Laufzeit-Logik. Secrets werden NIE getragen —
// nur Namen/Pfade/Status. WriteResult ist IpcResult-konform (sanitisiert).
// Reconcile-/DirReconcile-Typen + ALREADY_RECONCILED in contract-write-reconcile.ts
// Rename-/Move-Typen in contract-write-rename.ts (HR27: diese Datei <300 Z).
import type { IpcResult } from './contract'
import type {
  RenameRequest,
  RenameResult,
  MoveVersionedRequest,
  MoveVersionedResult,
  MoveImpactScanRequest,
  MoveImpactScanResult
} from './contract-write-rename'
import type { ReconcileRequest, ReconcileResult, DirReconcileRequest, DirReconcileResult } from './contract-write-reconcile'
export * from './contract-write-reconcile'

// ── Schreib-Aktionen ─────────────────────────────────────────────────────
// edit   = Inhalt einer existierenden Datei ersetzen (atomar, backup-first).
// add    = neue Datei anlegen (Parent-mkdir; existierendes Ziel -> Snapshot).
// archive= Datei in HR7-Archiv verschieben (kein Loeschen).
// move   = Datei an neuen Zielpfad verschieben.
// toggle = Eintrags-Status active<->archived schalten (idempotent).
export type WriteAction = 'edit' | 'add' | 'archive' | 'move' | 'toggle'

// Anfrage fuer eine einzelne Mutation. `path` ist der Zielpfad (Name sichtbar,
// nie Secret-Wert); `content` nur bei edit/add; `to` nur bei move.
// `ownerEdit`: Owner-Override fuer den owner-initiierten Einzeldatei-Edit
// (NUR action 'edit'/'add' auf `path`). Erlaubt die Secret-/Settings-Klasse bei
// aktivem Schreibmodus. Wirkt NIE auf `to` (move-Ziel), 'archive', 'move' oder
// Dir-Actions — dort bleibt das harte secret-skip (HR24).
// `ownerMove` (Finding A): Owner-Override fuer das frei gewaehlte Move-/Archiv-
// ZIEL. true -> der Ziel-Pfad (`to`) wird NICHT mehr gegen die Wurzel-Allowlist
// geprueft; der Owner darf an JEDES absolute Ziel verschieben (inkl. HR7-Archiv
// auf E:). Der QUELL-Scope-Check (req.path: Secret + Allowlist) und backup-first
// bleiben hart — ownerMove betrifft AUSSCHLIESSLICH den Ziel-Scope. Default
// (ohne Flag) = altes Verhalten (Ziel gescopet) -> rueckwaertskompatibel.
export interface WriteRequest {
  action: WriteAction
  path: string
  content?: string
  to?: string
  ownerEdit?: boolean
  ownerMove?: boolean
}

// Ergebnis-Nutzlast einer Mutation: was wirklich passiert ist (ohne Secret).
export interface WriteResultData {
  action: WriteAction
  path: string
  backupPath: string | null
  movedTo?: string
  inboundRefCount?: number
  inboundRefs?: string[]
}

// Sanitisiertes IPC-Ergebnis einer Mutation (data|null + error|null).
export type WriteResult = IpcResult<WriteResultData>

// ── Audit-Log ────────────────────────────────────────────────────────────
// Append-only-Eintrag pro Mutation. Enthaelt NUR Aktion/Name/Ergebnis/Zeit —
// keinen Datei-Inhalt, keinen Secret-Wert.
export interface WriteActionLog {
  ts: string
  action: WriteAction | 'archive-dir' | 'move-dir' | 'reconcile-folder' | 'readfull-reveal' | 'restore' | 'system-write' | 'env-migrate' | 'prefs-set' | 'source-mutate' | 'graph-write-ignore'
  path: string
  result: 'ok' | 'error'
  detail?: string
  // Ziel-NAME (Basename) bei move/move-dir/archive — fuer Forensik, damit der
  // Verbleib einer verschobenen Datei rekonstruierbar ist. NUR Basename (kein
  // voller Pfad, konsistent mit dem path-Basename-Prinzip; nie ein Secret).
  to?: string
}

// ── Secret-Guard-Ergebnis ────────────────────────────────────────────────
// Klassifikation eines Zielpfads fuer den Write-Layer (kein throw).
export interface GuardVerdict {
  writable: boolean
  reason: string | null
}

// ── Prefs (Teil D) ───────────────────────────────────────────────────────
// Lokale App-Tweaks/Prefs. Werte sind unkritisch (UI-Settings), keine Secrets.
export type PrefValue = string | number | boolean

export interface PrefsGetRequest {
  key?: string
}

export interface PrefsGetResultData {
  prefs: Record<string, PrefValue>
  adapter: 'file' | 'mariadb'
  fallbackReason: string | null
}

export type PrefsGetResult = IpcResult<PrefsGetResultData>

export interface PrefsSetRequest {
  key: string
  value: PrefValue
}

export interface PrefsSetResultData {
  key: string
  value: PrefValue
}

export type PrefsSetResult = IpcResult<PrefsSetResultData>

// ── readFull (neuer Read-Kanal; EditForm braucht Vollinhalt, nicht entry.code) ─
export interface ReadFullRequest {
  path: string
  family?: string // optionaler Familien-Hinweis fuer Cluster B (System/Watcher-Routing)
  reveal?: boolean // true = Owner-Demaskierung (roher Inhalt + Audit-Log-Eintrag)
}

// Credential-Metadaten (maskierte Sicht + VAR-Vorschlag). KEIN Secret-Wert —
// nur Status/Hinweise. B erzeugt, D rendert. Nie ein Wert in hasSecret/masked/varSuggestion.
export interface CredentialMeta {
  hasSecret: boolean          // true wenn Inhalt einen nackten Secret-Wert enthaelt
  secretKind: string | null   // z.B. 'api-key', 'password', 'token' (Heuristik, kein Wert)
  masked: string | null       // z.B. '***' — immer ohne echten Wert
  varSuggestion: string | null // z.B. 'TH_DB_PW' nach Namens-Konvention
  alreadyVarRef: boolean      // true wenn Zeile schon ${VAR}-Form traegt
}

export interface ReadFullResultData {
  path: string
  content: string
  credential?: CredentialMeta // optional; nur wenn B Credential-Heuristik angewendet hat
  masked?: boolean            // true = Secret-Klasse maskiert angezeigt (•••)
  maskedCount?: number        // Anzahl maskierter Stellen (0 wenn nichts maskiert)
}

export type ReadFullResult = IpcResult<ReadFullResultData>

// ── explain (Teil D) ─────────────────────────────────────────────────────
export interface ExplainRequest {
  // Stabiler Element-Bezug (Kategorie-/Entry-Kennung), kein Datei-Inhalt.
  kind: string
  name: string
}

export interface ExplainResultData {
  title: string
  text: string
}

export type ExplainResult = IpcResult<ExplainResultData>

// ── Dir-Operationen (Teil A — CONTRACT-SSoT) ─────────────────────────────
// Archive/Move ganzer Verzeichnisse und Ordner-Merge mit Pro-Datei-Entscheidung.
// Secrets werden NIE getragen — nur Pfad-Namen/Status. Kein Datei-Inhalt hier.

// Anfrage fuer archive oder move eines ganzen Verzeichnisses.
// archiveDir: `path` -> HR7-Archiv (kein Loeschen).
// moveDir:    `path` -> `to` (neuer Zielpfad, Parent-mkdir).
// `ownerMove` (Finding A): true -> der frei gewaehlte Ziel-Pfad (`to`) wird NICHT
// gegen die Wurzel-Allowlist geprueft (Owner darf an JEDES absolute Ziel). Quell-
// Secret-Tree + Quell-Scope + snapshotDir bleiben hart. Default = Ziel gescopet.
export interface DirActionRequest {
  action: 'archive-dir' | 'move-dir'
  path: string
  to?: string // nur bei move-dir
  ownerMove?: boolean
}

export interface DirActionResultData {
  action: DirActionRequest['action']
  path: string
  movedTo: string | null
  snapshotPath: string | null // HR7-Pre-Snapshot-Pfad des Quell-Verzeichnisses
  inboundRefCount?: number
  inboundRefs?: string[]
}

export type DirActionResult = IpcResult<DirActionResultData>

// ── Write-Status/-Toggle (In-App-Schreib-Schalter, Fix #1) ──────────────────
// Kein Secret, kein Pfad — nur Schreibmodus-Status fuer den Renderer.
export interface WriteStatusData {
  enabled: boolean
  sandbox: boolean
  reason: string | null
  registrarFailures: string[]
}

export type WriteStatusResult = IpcResult<WriteStatusData>

export interface WriteSetEnabledRequest {
  enabled: boolean
}

// ── System-Edit (Cluster C — CONTRACT-SSoT) ─────────────────────────────────
// Patcht einen einzelnen System-Eintrags-Feldwert + markiert ihn als 'manuell'.
// Kein Secret-Wert im Request (nur Feld-Name + neuer Anzeigewert). C fuellt den Handler.
export interface SystemEntryPatch {
  areaId: string   // z.B. 'hardware'
  entryId: string  // id des SystemEntry
  field: string    // Feld-Schluessel in entry.fields
  value: string    // neuer Anzeigewert (kein Secret)
}

export interface SystemEditRequest {
  patches: SystemEntryPatch[]
}

export interface SystemEditResultData {
  patched: number   // Anzahl erfolgreich gepatchter Felder
  manual: boolean   // immer true — System-Store-Markierung
}

export type SystemEditResult = IpcResult<SystemEditResultData>

// ── Env-Migrate (Cluster G — CONTRACT-SSoT) ──────────────────────────────────
// Owner loest Env-Variable-Anlage aus. KEIN value-Feld im Request:
// der Main-Prozess liest den Secret-Wert selbst aus der Datei (nie via Bridge).
export interface EnvMigrateRequest {
  path: string      // Config-Dateipfad mit dem Secret (Name sichtbar, nie Inhalt)
  varName: string   // vorgeschlagener Env-Variablen-Name, z.B. 'TH_DB_PW'
}

export interface EnvMigrateResultData {
  varName: string
  varSet: boolean     // true wenn [Environment]::SetEnvironmentVariable erfolgreich
  rewritten: boolean  // true wenn Config-Zeile auf ${VAR} umgestellt + backup erstellt
  backupPath: string | null
}

export type EnvMigrateResult = IpcResult<EnvMigrateResultData>

// ── Struktur-Scan (Cluster H — CONTRACT-SSoT) ────────────────────────────────
// Befundliste zu fehlplatzierten/doppelten Standard-Config-Ordnern.
// Nur Pfad-Existenz, kein Datei-Inhalt, keine Secrets.
export interface StrukturScanRequest {
  // optional: welche Roots gescannt werden (default: alle 4 konfigurierten Roots)
  roots?: string[]
}

export type StrukturFindingStatus = 'ok' | 'warn' | 'misplaced' | 'duplicate'

export interface StrukturFinding {
  path: string                    // absoluter Pfad des gefundenen Ordners/Artefakts
  status: StrukturFindingStatus
  root: string                    // der Scan-Root, zu dem dieser Befund gehoert
  kind: string                    // z.B. '.claude', 'rules', 'agents', 'skills'
  note?: string                   // kurze Beschreibung des Befunds (kein Inhalt)
}

export interface StrukturScanResultData {
  findings: StrukturFinding[]
  scannedRoots: string[]
  truncated: boolean              // true bei Tiefen-/Limit-Abbruch
}

export type StrukturScanResult = IpcResult<StrukturScanResultData>

// ── Preload-Write-API-Vertrag (window.electronAPI erweitert um diese Methoden) ─
// EINE Quelle fuer alle Renderer-Slices (B/C/D). Erweitert ElectronApi via
// Intersection im Preload + env.d.ts. NUR getypte Methoden ueber whitelisted Kanaele.
// WP-F besitzt alle Write-Kanaele; C/G/H importieren nur (NIE selbst schreiben).
export interface WriteApi {
  writeApply(req: WriteRequest): Promise<WriteResult>
  writeReconcile(req: ReconcileRequest): Promise<ReconcileResult>
  prefsGet(req?: PrefsGetRequest): Promise<PrefsGetResult>
  prefsSet(req: PrefsSetRequest): Promise<PrefsSetResult>
  readFull(req: ReadFullRequest): Promise<ReadFullResult>
  explain(req: ExplainRequest): Promise<ExplainResult>
  writeStatus(): Promise<WriteStatusResult>
  writeSetEnabled(req: WriteSetEnabledRequest): Promise<WriteStatusResult>
  // Dir-Operationen (Teil A — CONTRACT-SSoT)
  archiveDirEntry(path: string): Promise<DirActionResult>
  moveDirEntry(path: string, to: string): Promise<DirActionResult>
  reconcileFolder(req: DirReconcileRequest): Promise<DirReconcileResult>
  // Umbenennen-/Verschieben-Routen (WP-03; Typen aus contract-write-rename.ts)
  renameEntry(req: RenameRequest): Promise<RenameResult>
  moveEntryVersioned(req: MoveVersionedRequest): Promise<MoveVersionedResult>
  moveImpactScan(req: MoveImpactScanRequest): Promise<MoveImpactScanResult>
  // Neue Bridge-Methoden (WP-F Sync-Punkte; Handler fuellen C/G/H)
  systemWrite(req: SystemEditRequest): Promise<SystemEditResult>
  envCreate(req: EnvMigrateRequest): Promise<EnvMigrateResult>
  strukturScan(req?: StrukturScanRequest): Promise<StrukturScanResult>
  // watcherReadFull liegt im Read-Namespace (contract.ts/ElectronApi):
  // Kanal in IPC (channels.ts), Handler in registerIpc(). Kein Write-Kanal.
}
