// contract-system.ts — System-Umgebung + Toolchain-Watcher-Typen, aus
// contract.ts extrahiert (HR27-Split, WP2 2026-07-28; Muster: contract-llm).
// contract.ts re-exportiert alles — bestehende Importe aus '@shared/contract'
// bleiben stabil. Type-only-Zyklus (EntryStatus/SourceState) ist compile-zeit
// geloescht und damit unproblematisch.
import type { EntryStatus, SourceState, UpdateChannel } from './contract'

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
  // Additiv-optional (WP-F4F9): Auslieferungskanal (CLI/Extension/Desktop) —
  // wird in der Zeile ausgewiesen (CLI aktuell / Extension aktuell getrennt).
  channel?: UpdateChannel
  // Additiv-optional (WP2, 2026-07-28): false = der Eintrag stammt aus einer
  // Registry/einem Katalog und wurde NICHT live geprueft (z.B. ports.json).
  // Solche Eintraege sind Zusatzinfo und erzeugen NIE eine Diagnosekarte
  // oder einen Warn-Zaehler — dieselbe Wahrheit wie config-seitig (B3).
  // Fehlt das Flag, bleibt das Verhalten unveraendert.
  fileBacked?: boolean
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
  // Additiv-optional (WP-F4F9): Auslieferungskanal (CLI/Extension/Desktop).
  channel?: UpdateChannel
  // WP-F4F9: Grund, warum die Live-Versionspruefung fehlschlug (z.B. „cli-not-in-path").
  // Nur gesetzt, wenn der Live-Spawn scheiterte und `current` aus der Daemon-Datei stammt.
  liveError?: string
  // WP-F4F9: detected_at der Daemon-State-Zeile (Datei-Stand) — datiert den
  // Datei-Fallback, damit er nicht als frisch live geprueft wirkt.
  detectedAt?: string
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
