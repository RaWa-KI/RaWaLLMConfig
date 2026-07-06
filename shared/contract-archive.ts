// shared/contract-archive.ts
// Typen der Archiv-/Restore-Sektion (v1) — reine Type-Deklarationen, KEINE
// Laufzeit-Logik. Analog contract-graph.ts ausgelagert, damit contract-write.ts
// klein bleibt (HR27). Secrets werden NIE getragen — nur Pfad-Namen/Status/Zeit.
// Die Liste ist read-only (nur stat, nie Inhalt). Restore ist gated + backup-first.
import type { IpcResult } from './contract'

// Art eines Backup-Eintrags:
//   write    = Pre-Snapshot vor einer edit/add-Mutation (`*-phase2-write/*.bak`).
//   archive  = HR7-archivierte Datei (`*-phase2-archive/*`), per move entstanden.
//   snapshot = Ordner-Snapshot (`*-phase2-snapshot/*.snap`) — read-only, v1 NICHT
//              wiederherstellbar (ganzer Ordnerbaum, kein Einzeldatei-Restore).
export type ArchiveKind = 'write' | 'archive' | 'snapshot'

// Ein einzelner gelisteter Backup-Eintrag (nur stat-Metadaten, nie Inhalt).
export interface ArchiveBackupEntry {
  backupPath: string    // absoluter Pfad der Backup-Datei (Quelle fuer Restore)
  originalName: string  // Basename ohne .<HHMMSS-mmm>.bak bzw. ohne -i-Stamp
  stamp: string         // ISO-Zeit aus dem <HHMMSS-mmm>-Stempel (anzeigbar), '' wenn unparsebar
  dayTag: string        // YYYY-MM-DD aus dem Tages-Ordnernamen
  kind: ArchiveKind
  size: number          // Dateigroesse in Bytes (statSync)
  // Additiv-optional: absoluter Original-Quellpfad, falls aus einem .origin-Sidecar
  // bekannt (Restore-Vorbelegung). Fehlt -> nur der Basename ist bekannt. Reiner
  // Pfad-String, nie ein Secret-Wert (Pfade sind in der App ohnehin sichtbar).
  // Fehlt das Feld (Alt-Backups ohne Sidecar), bleibt das Verhalten unveraendert.
  originalPath?: string
}

// READ-Resultat: gelistete Eintraege (sort desc nach stamp) + Limit-Hinweis.
export interface ArchiveListResult {
  entries: ArchiveBackupEntry[]
  truncated: boolean    // true wenn das Limit griff (mehr Eintraege vorhanden)
}

// RESTORE-Request: welche Backup-Datei zurueck auf welchen Zielpfad. backupPath
// MUSS unter dem Archiv-Root liegen (Main validiert — kein freier Quellpfad).
export interface ArchiveRestoreRequest {
  backupPath: string    // Quelle (gelistete Backup-Datei, unter archiveRoot)
  toPath: string        // Zielpfad, auf den wiederhergestellt wird (gescopet)
  // Optional fuer Rueck-Move-Restore: Referenzen zeigen aktuell noch auf diesen
  // Pfad und werden nach erfolgreichem Restore additiv auf toPath umgeschrieben.
  refsPointTo?: string
}

// RESTORE-Resultat (sanitisiert): wohin restauriert wurde + Pre-Restore-Snapshot.
export interface ArchiveRestoreResultData {
  restoredTo: string            // Zielpfad (Name sichtbar, nie Secret)
  preRestoreSnapshot: string | null  // HR7-Snapshot der alten Zieldatei (null wenn Ziel fehlte)
}

export type ArchiveRestoreResult = IpcResult<ArchiveRestoreResultData>

// Bridge-Vertrag (window.electronAPI erweitert um diese zwei Methoden). Analog
// GraphApi/CompareApi — eigene Bridge, weil WriteApi/contract-write sie nicht fuehrt.
export interface ArchiveApi {
  archiveList(): Promise<IpcResult<ArchiveListResult>>
  archiveRestore(req: ArchiveRestoreRequest): Promise<ArchiveRestoreResult>
}
