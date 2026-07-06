// contract-write-rename.ts — Typen fuer Umbenennen-/Verschieben-Routen (WP-03).
// Aus contract-write.ts ausgelagert (HR27: contract-write.ts bleibt <300 Z).
// Reine Type-Deklarationen, KEINE Laufzeit-Logik. Secrets werden NIE getragen —
// nur Namen/Pfade/Status. Alle Result-Typen sind IpcResult-konform (sanitisiert).
import type { IpcResult } from './contract'

// ── Umbenennen (rename) ───────────────────────────────────────────────────
// Seitenwahl: welche physische(n) Seite(n) eines Duplikat-Paares umbenannt
// werden. 'shared' = nur die Shared-/Trunk-Seite, 'claude' = nur die Claude-/
// Mirror-Seite, 'beide' = beide Seiten (Datei ODER Ordner).
export type RenameSide = 'beide' | 'shared' | 'claude'

// Eine Seite mit ECHTEM physischem Pfad (nie DuplicateSet.name). Optional pro
// Anfrage; bei 'beide' MUESSEN beide gesetzt sein, bei 'shared'/'claude' nur die
// jeweils gewaehlte Seite. `path` ist der Quell-Pfad (Datei oder Ordner).
export interface RenameSidePath {
  // 'shared' = Shared-/Trunk-Seite, 'claude' = Claude-/Mirror-Seite.
  side: 'shared' | 'claude'
  path: string
}

// Anfrage: Datei ODER Ordner umbenennen. `newName` ist NUR der neue Basisname
// (kein Pfad-Segment, kein '/'/'\\') — das Zielverzeichnis bleibt je Seite gleich.
// Secret-/Scope-Gate prueft Quell- UND Ziel-Basename je Seite (apply-Dispatch).
export interface RenameRequest {
  sides: RenameSide
  newName: string
  shared?: RenameSidePath // ECHTER Pfad der Shared-/Trunk-Seite
  claude?: RenameSidePath // ECHTER Pfad der Claude-/Mirror-Seite
}

// Pro-Seite-Ergebnis im Rename-Report (analog DirFileReconcileEntry).
export interface RenameSideResult {
  side: 'shared' | 'claude'
  status: 'renamed' | 'secret-skip' | 'out-of-scope' | 'error'
  fromPath: string
  toPath: string | null
  backupPath?: string | null
  error?: string // sanitisierter Grund (kein Secret, kein Pfad-Stack)
}

export interface RenameResultData {
  newName: string
  sides: RenameSideResult[]
  partial: boolean // true wenn nicht alle gewaehlten Seiten umbenannt wurden
}

export type RenameResult = IpcResult<RenameResultData>

// ── Verschieben mit Versions-Wahl (moveVersioned) ─────────────────────────
// Owner waehlt EINE physische Version (shared|claude) und einen freien Ziel-Pfad.
// `to` ist der vollstaendige neue Zielpfad (Datei/Ordner). Finding A: das ZIEL ist
// owner-frei — JEDES absolute Ziel ist erlaubt (auch ausserhalb der Config-Wurzeln,
// inkl. HR7-Archiv auf E:). Der QUELL-Pfad bleibt secret-/scope-gescopet und
// backup-first laeuft vor jedem Move. Jeder Versions-Move ist owner-initiiert
// (ownerMove wird im Service hart gesetzt).
export interface MoveVersionedRequest {
  // Welche physische Seite verschoben wird.
  version: 'shared' | 'claude'
  fromPath: string // ECHTER Quell-Pfad der gewaehlten Version (Datei oder Ordner)
  to: string       // freier Ziel-Pfad (beliebiger absoluter Ort, owner-gewaehlt)
}

export interface MoveVersionedResultData {
  version: 'shared' | 'claude'
  fromPath: string
  movedTo: string | null
  backupPath: string | null // Pre-Snapshot der Quelle (HR7)
  isDir: boolean
}

export type MoveVersionedResult = IpcResult<MoveVersionedResultData>

// ── Warn-only Referenz-Impact-Scan vor Move ───────────────────────────────
// Read-only Vorabscan: findet Referenzen, die nach einem Move vermutlich noch
// auf den alten Ort zeigen. KEIN Auto-Fix, KEIN Inhalt von Secret-Pfaden.
export interface MoveImpactScanRequest {
  version: 'shared' | 'claude'
  fromPath: string
  to: string
  maxResults?: number
}

export type MoveImpactKind =
  | 'path'
  | 'wikilink'
  | 'governance-dependency'
  | 'loader-default'

export interface MoveImpactFinding {
  filePath: string
  line: number
  kind: MoveImpactKind
  match: string
  snippet: string
  field?: 'canonical_source' | 'loader_path'
}

export interface MoveImpactSkipped {
  ignored: number
  binary: number
  secret: number
  oversize: number
}

export interface MoveImpactScanData {
  version: 'shared' | 'claude'
  fromPath: string
  to: string
  searchedFor: string[]
  findings: MoveImpactFinding[]
  scannedFiles: number
  skipped: MoveImpactSkipped
  truncated: boolean
}

export type MoveImpactScanResult = IpcResult<MoveImpactScanData>
