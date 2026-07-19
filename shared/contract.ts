// Datenmodell-Vertrag (Single Source of Truth) — Main + Renderer einig.
// Stabiler IPC-/Renderer-Vertrag; die visuelle Darstellung ist davon entkoppelt.
// Scanner-Payloads tragen keine Secret-Werte, nur sichere Metadaten.

import type { CoverageRow } from './contract-coverage'
export type { CoverageState, CoverageCell, CoverageRow } from './contract-coverage'
// Type-only-Import (zur Compile-Zeit geloescht -> kein Laufzeit-Zyklus, obwohl
// contract-write seinerseits IpcResult aus dieser Datei zieht): watcherReadFull
// ist eine Read-Route und gehoert in ElectronApi, nutzt aber die ReadFull-Typen.
import type { ReadFullRequest, ReadFullResult } from './contract-write'

export type Scope = 'managed' | 'global' | 'project' | 'local' | 'shared'
export type EntryStatus = 'active' | 'stale' | 'conflict' | 'dup' | 'archived' | 'acknowledged'
export type SourceState = 'current' | 'recent' | 'update' | 'gated' | 'flag'
export type DiffKind = 'ctx' | 'add' | 'del'
export type Verdict = 'same' | 'diff'
export type LoadMode = 'immer' | 'bedingt' | 'bei-bedarf' | 'unbekannt'

// ── Config-Familie (claude/codex/shared/local + custom) ──────────────────
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
  // Vergleich, z.B. "~/.claude", "Projekte (Parent)", "WS: RaWaLLMConfig".
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
  confidence?: 'heuristic' | 'named-mirror'
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

export interface LlmConfig {
  categories: Category[]
  duplicates: DuplicateSet[]
  diffLabels?: DiffLabels
  comingSoon?: ComingSoon
  // Additiv-optional (A8-1): gesetzt, wenn der Familien-Scan real gecrasht ist
  // (Provider-Vollausfall). Traegt NUR die Klartext-Fehler-message (secret-frei,
  // gekappt) — kein Objekt-/Stack-Dump. Fehlt das Feld -> Scan lief fehlerfrei.
  // Unterscheidet einen echten Scan-Crash von "nichts konfiguriert" (leere
  // Familie ohne scanError). Renderer zeigt dafuer ein sichtbares Fehler-Signal.
  scanError?: string
  // Additiv-optional (WP-01): nur auf der 'shared'-Familie befuellt; fehlt das
  // Feld -> Renderer-Verhalten unveraendert. Enthaelt die Spiegelungs-Matrix
  // (Cross-Tool-Abdeckung Shared/Claude/Codex pro logischer Config).
  coverage?: CoverageRow[]
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

// ── System-Umgebung (sys-Familie) ────────────────────────────────────────
export interface SystemEntry {
  id?: string
  name: string
  status: EntryStatus
  v?: string
  desc: string
  fields?: Record<string, string>
  path?: string // optionaler Dateipfad fuer readFull-Drilldown (Cluster C/B; nie Secret)
  manualFields?: string[] // Feld-Schluessel mit manuellem Override (Cluster C system-store; "manuell"-Badge)
  conflictReason?: string // bei status==='conflict': Klartext der Konflikt-Art (z.B. Port-Konflikt-Risiko)
}

export interface SystemArea {
  id: string
  label: string
  icon: string
  blurb: string
  entries: SystemEntry[]
}

export interface System {
  updated: string
  areas: SystemArea[]
}

// ── Toolchain-Watcher (Updates-Sektion) ──────────────────────────────────
export interface WatcherDaemon {
  status: string
  lastResult: string
  schedule: string
  tokens: string
  sources: number
  updated: string
  note: string
}

export interface WatcherTier {
  id: 1 | 2 | 3
  label: string
  mode: string
  cls: string
  desc: string
}

export interface WatcherSource {
  name: string
  kind: string
  current: string
  latest: string
  tier: 1 | 2 | 3
  state: SourceState
  note?: string
  path?: string // optionaler Quelldateipfad fuer readFull-Drilldown (Cluster B; nie Secret)
}

export interface WatcherChangelog {
  tool: string
  version: string
  date: string
  summary: string
  path?: string // optionaler Pfad zum Volltext-Changelog (Cluster B/C; nie Secret)
}

export interface Watcher {
  daemon: WatcherDaemon
  tiers: WatcherTier[]
  sources: WatcherSource[]
  changelogs: WatcherChangelog[]
}

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
