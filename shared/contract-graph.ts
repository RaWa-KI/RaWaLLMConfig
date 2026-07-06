// shared/contract-graph.ts
// Typen der Graph-Sektion (Teil-B): graphify-Ingest (nodes/links/communities/orphans).
// WP-B0 final: read-only Ingest pro WS + einfache Metriken + Gesamt-Container.
// Kanten = `links` (NICHT `edges`); Alt-Shape `edges`/`status` (caudex) als Fallback
// beim Parsen im Main (graphify-ingest.ts). Hier nur das normalisierte Resultat.
// Ausgelagert aus contract.ts (R3, 300-Z-Limit). Nie Secret-Inhalt — nur Metadaten.

// Ein Knoten aus graphify-out/graph.json (normalisiert). `id` ist der einzige
// Pflichtwert; file_type/community sind optionale Metadaten fuer Faerbung/Cluster.
export interface GraphNode {
  id: string
  file_type?: string
  community?: number
}

// Eine gerichtete Kante (source -> target). Im normalisierten Resultat heisst das
// Feld immer `links` (Alt-Shape `edges` wird im Ingest darauf gemappt).
export interface GraphLink {
  source: string
  target: string
}

// Einfache Pro-WS-Metriken (rein abgeleitet, keine Secrets). Prozentwerte 0..100.
export interface GraphWsMetrics {
  files: number // == nodeCount (1 Knoten ~ 1 Datei im graphify-Modell)
  nodeCount: number
  linkCount: number
  communities: number // Anzahl distinct community-Werte
  orphanCount: number // Knoten ohne jede Kante (source/target)
  orphanPct: number // orphanCount / nodeCount * 100 (0 bei leerem Graph)
  unresolved: number // Kanten mit unbekanntem source/target-Endpunkt
}

// Read-only Ingest-Resultat pro WS. `placeholder` true, wenn kein verwertbares
// graphify-out/graph.json vorhanden/parsebar war (dann nodes/links leer, Metriken 0).
export interface GraphIngestResult {
  ws: string // absolute WS-Wurzel (root)
  label: string // sprechendes WS-Label (z.B. "RaWaLLMConfig")
  nodes: GraphNode[]
  links: GraphLink[]
  metrics: GraphWsMetrics
  placeholder: boolean
}

// Gesamt-Container ueber alle Workspaces (IPC-Nutzlast graph:ingest).
export interface GraphIngestAll {
  workspaces: GraphIngestResult[]
}

// ── Ignore-Scopes der Graph-Sektion (WP-B4) ──────────────────────────────
// Drei GETRENNTE Ignore-Quellen je WS. Renderer schickt NIE einen freien Pfad,
// nur das Scope-Enum + wsRoot + content; der Main mappt scope -> Datei (kein
// client-gelieferter Pfad). Ignore-Listen sind keine Secrets — nie anderer Inhalt.
export type IgnoreScope = 'obsidian' | 'graphify' | 'gitignore'

// Aktueller Stand eines Scopes: exists-Flag + Roh-Inhalt der Datei.
// obsidian: content = der userIgnoreFilters-Block (eine Glob je Zeile, aus dem
// JSON extrahiert); graphify/gitignore: der reine Datei-Text. Leer wenn !exists.
export interface IgnoreScopeState {
  exists: boolean
  content: string
}

// READ-Resultat: aktueller Stand aller drei Scopes (read-only, kein Gate).
export interface GraphIgnores {
  obsidian: IgnoreScopeState
  graphify: IgnoreScopeState
  gitignore: IgnoreScopeState
}

// WRITE-Request: genau EIN Scope wird geschrieben (kein Zwangs-Sync der anderen).
// content = der neue Inhalt (obsidian: userIgnoreFilters-Zeilen; sonst Datei-Text).
export interface GraphWriteIgnoreRequest {
  wsRoot: string
  scope: IgnoreScope
  content: string
}

// WRITE-Resultat: geschriebener Scope + Pre-Snapshot-Pfad (leer falls Neuanlage).
export interface GraphWriteIgnoreData {
  scope: IgnoreScope
  snapshotPath: string
}
