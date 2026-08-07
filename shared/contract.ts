// Datenmodell-Vertrag (Single Source of Truth) — Main + Renderer einig.
// Stabiler IPC-/Renderer-Vertrag; die visuelle Darstellung ist davon entkoppelt.
// Scanner-Payloads tragen keine Secret-Werte, nur sichere Metadaten.

export type { CoverageState, CoverageCell, CoverageRow } from './contract-coverage'
// HR27-Split (WP-5): LlmConfig lebt in contract-llm.ts; Import (lokale
// Verwendung in AppData) + Re-Export halten alle bestehenden Importe aus
// '@shared/contract' stabil.
import type { LlmConfig } from './contract-llm'
export type { LlmConfig } from './contract-llm'
// Type-only-Import (zur Compile-Zeit geloescht -> kein Laufzeit-Zyklus, obwohl
// contract-write seinerseits IpcResult aus dieser Datei zieht): watcherReadFull
// ist eine Read-Route und gehoert in ElectronApi, nutzt aber die ReadFull-Typen.
import type { ReadFullRequest, ReadFullResult } from './contract-write'

export type Scope = 'managed' | 'global' | 'project' | 'local' | 'shared'
// WP-F4F9 (2026-08-07): drei neue Status trennen „nicht pruefbar" / „Beispiel" /
// „nicht eingerichtet" von 'stale' — 'stale' („veraltet") darf nur noch bei
// BELEGT alter Version gesetzt werden, nie bei Spawn-Fehler oder Katalog-Eintrag.
//   unknown       = Pruefung war nicht moeglich (z.B. CLI-Spawn fehlgeschlagen)
//   info          = neutrale Zusatzinfo ohne Pruefung (z.B. Modell-Beispiel)
//   notConfigured = bewusst/noch nicht eingerichtet (z.B. Cloud-Key nicht gesetzt)
export type EntryStatus =
  | 'active' | 'stale' | 'conflict' | 'dup' | 'archived' | 'acknowledged'
  | 'unknown' | 'info' | 'notConfigured'
export type SourceState = 'current' | 'recent' | 'update' | 'gated' | 'flag'
// WP-F4F9: Auslieferungskanal eines Versions-Eintrags — CLI (`<bin> --version`),
// Editor-Extension und Desktop-App-Update sind getrennte Kanaele mit getrennter
// Aktualitaets-Wahrheit und werden in der Zeile getrennt ausgewiesen.
export type UpdateChannel = 'cli' | 'extension' | 'desktop'
export type DiffKind = 'ctx' | 'add' | 'del'
export type Verdict = 'same' | 'diff'
export type LoadMode = 'immer' | 'bedingt' | 'bei-bedarf' | 'unbekannt'

// ── Config-Familie (claude/codex/shared/local + custom) ──────────────────
// Additiv-optional (WP-F3): konkrete Fundstelle einer gebündelten Sammelzeile
// (Audit-Summary im Coverage-Register) — Name plus Pfad, nie Werte.
export interface CoverageItem {
  name: string
  path: string
}

export interface ConfigEntry {
  id: string
  name: string
  status: EntryStatus
  scope: Scope
  path: string
  desc: string
  updated: string
  fields?: Record<string, string>
  code?: string
  dupOf?: string
  // Additiv-optional (WP-07): mehrere Eintraege teilen sich EINE Quelldatei
  // (z.B. die Plugin-Eintraege aus installed_plugins.json). Solche Eintraege
  // haben kein eigenes Umbenennen-/Verschieben-Ziel — die Renderer-Aktionen
  // blenden sich dann aus. Fehlt das Flag, bleibt das Verhalten unveraendert.
  inventory?: true
  // Additiv-optional (F6): sprechender Ursprung eines Eintrags fuer den
  // Vergleich, z.B. "~/.claude", "Projektordner", "WS: RaWaLLMConfig".
  // Genutzt von Instructions (CLAUDE.md/AGENTS.md ueber alle WS). Fehlt das
  // Feld, bleibt das Renderer-Verhalten unveraendert.
  origin?: string
  // Additiv-optional: bei status==='conflict' der KLARTEXT der Konflikt-Art
  // (was kollidiert womit, warum) als eigenes Feld statt im desc-Fliesstext
  // versteckt, z.B. "Nur im Plugin-Ordner, fehlt im MCP-Register" oder
  // "JSON-Parse-Fehler in installed_plugins.json". Renderer zeigt es als eigene
  // Konflikt-Zeile. Fehlt das Feld, bleibt das Verhalten unveraendert.
  conflictReason?: string
  loadMode?: LoadMode
  tokensEstimated?: number
  // Additiv-optional (Index-Fundament): die EXTRAHIERTEN Such-Schluessel der
  // Quelldatei (JSON-Object.keys rekursiv / TOML/env-Keys links von =,: /
  // .md-Headings + Frontmatter-Keys). Es sind AUSSCHLIESSLICH Keys/Struktur,
  // NIE Werte — Secret-Werte landen hier nie. Genutzt fuer Volltext-/Schluessel-
  // Suche. Fehlt das Feld, bleibt das Verhalten unveraendert.
  searchKeys?: string[]
  // Additiv-optional (WP-5, B6/B7): false = der Eintrag hat KEINE eigene
  // bearbeitbare Datei (Endpoint-/Katalog-/Key-Eintrag; path traegt dann z.B.
  // eine URL oder API-Basis). Der Renderer blendet Bearbeiten-Panel,
  // CRUD-Aktionen und Prefill aus, zeigt einen erklaerenden Hinweis und ruft
  // kein readFull auf. Fehlt das Flag, gilt true (dateibasiert) — Verhalten
  // unveraendert.
  fileBacked?: boolean
  // Additiv-optional (Diagnosekarten-Regel WP1, 2026-07-28): Nutzungsabsicht
  // des Nutzers fuer diesen Anbieter (Quellen-Toggle, Default aus). Nur bei
  // providerEnabled === true darf ein fehlender Cloud-API-Key eine
  // Diagnosekarte „Key nicht gesetzt" erzeugen — ein OAuth-/Login-Setup ohne
  // Keys zeigt sonst Dauer-Rauschen. Fehlt das Flag, gilt keine Karte.
  providerEnabled?: boolean
  // Additiv-optional (WP-F4F9): Auslieferungskanal des Eintrags
  // (CLI/Extension/Desktop) — wird in der Zeile ausgewiesen. Fehlt das Feld,
  // bleibt das Renderer-Verhalten unveraendert.
  channel?: UpdateChannel
  // Additiv-optional (WP-F3): die ersten konkreten Fundstellen einer
  // gebündelten Sammelzeile (gekappt an der Quelle); coverageItemsTotal
  // trägt die Gesamtzahl — der Renderer zeigt „+ n weitere". Fehlen die
  // Felder, bleibt das Renderer-Verhalten unveraendert.
  coverageItems?: CoverageItem[]
  coverageItemsTotal?: number
}

export interface Category {
  id: string
  label: string
  icon: string
  path: string
  blurb: string
  entries: ConfigEntry[]
}

export interface DiffLine {
  l: string
  t: DiffKind
  both?: boolean
  trunkOnly?: boolean
  mirrorOnly?: boolean
}

export interface DuplicateSide {
  path: string
  updated: string
}

// ── Ordner-Dubletten (Skills/Agents sind VERZEICHNISSE, kein Einzeldatei-Diff) ──
// Bei einem Verzeichnis-Paar vergleicht der Scanner rekursiv die Dateiinhalte
// (SHA-256) und liefert pro relativer Datei einen Status. Secrets nie getragen
// (nur Status + Pfade; Inhalt erst on-demand via readFull, secret-guarded).
export type DirFileStatus = 'same' | 'diff' | 'trunk-only' | 'mirror-only'

export interface DirFileEntry {
  rel: string // relativer Pfad im Ordner, z.B. "SKILL.md" oder "refs/x.md"
  status: DirFileStatus
  trunkPath?: string // absoluter Pfad fuer readFull-Drilldown (wenn trunk-seitig vorhanden)
  mirrorPath?: string // absoluter Pfad (wenn mirror-seitig vorhanden)
  secret?: boolean // secret-bearing -> kein Inhalts-Drilldown, nur Status
}

export interface DirCompare {
  files: DirFileEntry[]
  sameCount: number
  diffCount: number
  trunkOnlyCount: number
  mirrorOnlyCount: number
  truncated?: boolean // true wenn das Datei-Limit (Sicherheitsgrenze) erreicht wurde
}

export interface DuplicateSet {
  cat: string
  name: string
  verdict: Verdict
  trunk: DuplicateSide
  mirror: DuplicateSide
  note: string
  lines: DiffLine[]
  dir?: DirCompare // gesetzt nur bei Verzeichnis-Dubletten (sonst Einzeldatei-Diff via lines)
  // ── Additive Felder (WP-D1): Einzeldatei-Inhalts-Lieferung fuer ALLE Klassen ──
  // Der Scanner liefert jetzt auch fuer 'same'-Paare (alle Zeilen ctx), Secret-
  // Klasse (MASKIERTE Zeilen) und oversize (gekappter Diff) befuellte `lines`, damit
  // der Renderer ohne ad-hoc-readFull anzeigen kann. Verdict bleibt aus ROH-SHA.
  masked?: boolean // true = `lines` enthalten MASKIERTE Inhalte (Secret-Klasse); Anzeige darf nicht entmaskieren
  linesTruncated?: boolean // true = `lines` sind ein gekappter Vergleich (Datei zu gross), Hinweis im Header-ctx
  // Additiv-optional: die GEGENSEITE des Vergleichs (Familie der Nicht-Trunk-Seite).
  // Auf Shared-Seiten erlaubt das dem Renderer einen [Claude|Codex]-Umschalter, der
  // nur EINE Spiegel-Seite gegen den Shared-Trunk zeigt. Fehlt das Feld, bleibt das
  // Renderer-Verhalten unveraendert (alle Sets werden angezeigt).
  mirrorFamily?: 'claude' | 'codex' | 'local' | 'shared'
  // 'content-hash' = inhaltsbasierte Erkennung (Plan C: Groessen-Bucket +
  // SHA-256-Gruppe), unabhaengig von Namen/Flach-Scan; die anderen Werte sind
  // die namens-/pfadbasierte Heuristik (dedupe.ts).
  confidence?: 'heuristic' | 'named-mirror' | 'content-hash'
}

export interface DiffLabels {
  trunk: string
  mirror: string
  trunkTag: string
  mirrorTag: string
}

export interface ComingSoon {
  title: string
  text: string
}

export interface LlmDef {
  id: string
  glyph: string
  name: string
  sub: string
  color: string
  path: string
  coming?: boolean
  // Additiv-optional (A8-1): Klartext-Fehler-message, wenn der Scan dieser
  // Familie gecrasht ist (secret-frei, gekappt). Die Familie bleibt dann
  // klickbar (nicht 'coming'); der Renderer zeigt einen Fehler-Chip.
  scanError?: string
}

export interface Machine {
  id: string
  label: string
  role: string
  path: string
  active: boolean
}

export interface Snapshot {
  frozen: boolean
  date: string
  label: string
}

// ── System-Umgebung + Toolchain-Watcher: in contract-system.ts ausgelagert
// (HR27-Split, WP2 2026-07-28). Re-Export haelt alle bestehenden Importe aus
// '@shared/contract' stabil (Muster: LlmConfig aus contract-llm).
import type { System, Watcher } from './contract-system'
export type {
  SystemEntry, SystemArea, System,
  WatcherDaemon, WatcherTier, WatcherSource, WatcherChangelog, Watcher
} from './contract-system'

// ── Aggregiertes App-Modell (config:getAll) ──────────────────────────────
export interface AppData {
  snapshot: Snapshot
  machines: Machine[]
  llms: LlmDef[]
  data: Record<string, LlmConfig>
}

// ── Innendatei-Liste (config:listDir) — REIN read-only ───────────────────
// Liefert pro Datei NUR Name/Groesse/secret-Flag (KEIN Inhalt). Genutzt fuer
// die Innendatei-Liste von Uebersichts-Eintraegen (Ordner-Drilldown). Scope ist
// hart auf die bekannten Config-Wurzeln begrenzt (path-scope/config-roots).
export interface ListDirRequest {
  dirPath: string
}

export interface ListDirFile {
  rel: string // relativer Pfad ab dirPath (z.B. "SKILL.md" oder "refs/x.md")
  name: string // reiner Basename
  size: number // Dateigroesse in Bytes
  secret: boolean // secret-bearing -> nur Status, NIE Inhalt
}

export interface ListDirData {
  files: ListDirFile[]
  truncated?: boolean // true wenn das Datei-Limit (Sicherheitsgrenze) erreicht wurde
}

// ── IPC-Huelle (sanitisiert; nie Secrets, nie Stacktraces mit Pfaden) ────
export interface IpcResult<T> {
  data: T | null
  error: string | null
}

// ── Preload-API-Vertrag (window.electronAPI) ─────────────────────────────
export interface ElectronApi {
  readConfig(): Promise<IpcResult<AppData>>
  readSystem(): Promise<IpcResult<System>>
  readWatcher(): Promise<IpcResult<Watcher>>
  // Read-Drilldown fuer Watcher-Vollinhalt (secret-guarded). Kanal in IPC
  // (channels.ts), Handler in registerIpc() — konsistent im Read-Namespace.
  watcherReadFull(req: ReadFullRequest): Promise<ReadFullResult>
}
