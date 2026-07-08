// graphify-ingest.ts — Cluster B. Read-only Ingest der graphify-Ausgabe je WS:
// liest pro Workspace `<root>/graphify-out/graph.json`, normalisiert Knoten/Kanten
// und berechnet einfache Metriken (Communities, Orphans, unresolved). Fehlt die
// Datei oder ist sie kaputt -> placeholder, KEIN Crash, KEIN throw. Nur Knoten-/
// Kanten-Metadaten (id/file_type/community), NIE Datei-Inhalt, NIE Secret-Werte.
// Self-registering via register-write.ts (safeRegister('graph', ...)). Owner-B0.
import { ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC_WRITE } from '@shared/channels-write'
import type { IpcResult } from '@shared/contract'
import type { ResolvedIntegration } from '@shared/contract-integrations'
import type {
  GraphNode,
  GraphLink,
  GraphWsMetrics,
  GraphIngestResult,
  GraphIngestAll,
  GraphModuleState,
  GraphOptionalModuleId
} from '@shared/contract-graph'
import { workspaceRoots } from '../services/config-roots'
import { resolveIntegrations } from '../services/integration-resolve'

// Roh-Form der graphify-out/graph.json. Tolerant: Kanten als `links` ODER (Alt-
// Shape, caudex) `edges`; zusaetzliche Felder wie `status` werden ignoriert.
interface RawGraph {
  nodes?: unknown[]
  links?: unknown[]
  edges?: unknown[]
}

// Einen Roh-Knoten normalisieren; nur id (Pflicht) + optionale Metadaten lesen.
function toNode(raw: unknown): GraphNode | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = o.id
  if (typeof id !== 'string' || id.length === 0) return null
  const node: GraphNode = { id }
  if (typeof o.file_type === 'string') node.file_type = o.file_type
  if (typeof o.community === 'number') node.community = o.community
  return node
}

// Eine Roh-Kante normalisieren; source/target koennen String oder {id} sein.
function toLink(raw: unknown): GraphLink | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const src = endpointId(o.source)
  const tgt = endpointId(o.target)
  if (src == null || tgt == null) return null
  return { source: src, target: tgt }
}

// Endpunkt-id aus String oder Objekt {id} extrahieren (graphify-Varianten).
function endpointId(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (v && typeof v === 'object') {
    const id = (v as Record<string, unknown>).id
    if (typeof id === 'string' && id.length > 0) return id
  }
  return null
}

// Roh-JSON -> normalisierte Knoten/Kanten. Alt-Shape: `links` bevorzugt, sonst
// `edges`. Wirft nie; ungueltige Eintraege werden uebersprungen.
function parseGraph(rawText: string): { nodes: GraphNode[]; links: GraphLink[] } {
  const parsed = JSON.parse(rawText) as RawGraph
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes : []
  const rawLinks = Array.isArray(parsed.links)
    ? parsed.links
    : Array.isArray(parsed.edges)
      ? parsed.edges
      : []
  const nodes = rawNodes.map(toNode).filter((n): n is GraphNode => n !== null)
  const links = rawLinks.map(toLink).filter((l): l is GraphLink => l !== null)
  return { nodes, links }
}

// Orphans = Knoten-ids, die in keiner Kante als source/target vorkommen.
function findOrphans(nodes: GraphNode[], links: GraphLink[]): number {
  const linked = new Set<string>()
  for (const l of links) {
    linked.add(l.source)
    linked.add(l.target)
  }
  let orphans = 0
  for (const n of nodes) if (!linked.has(n.id)) orphans++
  return orphans
}

// Einfache Metriken (rein abgeleitet, keine Secrets).
function computeMetrics(nodes: GraphNode[], links: GraphLink[]): GraphWsMetrics {
  const ids = new Set(nodes.map((n) => n.id))
  const communities = new Set<number>()
  for (const n of nodes) if (typeof n.community === 'number') communities.add(n.community)
  let unresolved = 0
  for (const l of links) if (!ids.has(l.source) || !ids.has(l.target)) unresolved++
  const orphanCount = findOrphans(nodes, links)
  const nodeCount = nodes.length
  const orphanPct = nodeCount > 0 ? Math.round((orphanCount / nodeCount) * 1000) / 10 : 0
  return {
    files: nodeCount,
    nodeCount,
    linkCount: links.length,
    communities: communities.size,
    orphanCount,
    orphanPct,
    unresolved
  }
}

// Leeres Placeholder-Resultat (kein graphify-out / parse-Fehler).
function placeholderResult(root: string, label: string): GraphIngestResult {
  return {
    ws: root,
    label,
    nodes: [],
    links: [],
    metrics: computeMetrics([], []),
    placeholder: true
  }
}

// Einen WS einlesen. Fehlt graph.json oder ist kaputt -> placeholder (kein throw).
function ingestWs(root: string, label: string): GraphIngestResult {
  const file = path.join(root, 'graphify-out', 'graph.json')
  let rawText: string
  try {
    rawText = fs.readFileSync(file, 'utf8')
  } catch {
    return placeholderResult(root, label) // Datei fehlt -> placeholder, kein Befund.
  }
  try {
    const { nodes, links } = parseGraph(rawText)
    return { ws: root, label, nodes, links, metrics: computeMetrics(nodes, links), placeholder: false }
  } catch (err) {
    console.error('[scan:graph]', `parse ${label}: ${err instanceof Error ? err.message.slice(0, 60) : 'fail'}`)
    return placeholderResult(root, label) // kaputtes JSON -> placeholder.
  }
}

function defaultGraphModuleState(id: GraphOptionalModuleId): GraphModuleState {
  return { id, availability: 'notConfigured', root: null, detail: 'Nicht eingerichtet' }
}

function toGraphModuleState(
  id: GraphOptionalModuleId,
  integrations: ResolvedIntegration[]
): GraphModuleState {
  const resolved = integrations.find((item) => item.id === id)
  if (!resolved) return defaultGraphModuleState(id)
  return {
    id,
    availability: resolved.availability,
    root: resolved.root,
    detail: resolved.detail
  }
}

function graphModuleStates(
  integrations: ResolvedIntegration[]
): Record<GraphOptionalModuleId, GraphModuleState> {
  return {
    graphify: toGraphModuleState('graphify', integrations),
    obsidian: toGraphModuleState('obsidian', integrations)
  }
}

export function buildGraphIngestAll(
  roots = workspaceRoots(),
  integrations = resolveIntegrations()
): GraphIngestAll {
  const modules = graphModuleStates(integrations)
  if (modules.graphify.availability !== 'active') return { workspaces: [], modules }
  return {
    workspaces: roots.map((w) => ingestWs(w.root, w.label)),
    modules
  }
}

// Handler-Logik (rein, kein ipcMain-Coupling — leicht testbar).
function handleGraphIngest(): IpcResult<GraphIngestAll> {
  try {
    return { data: buildGraphIngestAll(), error: null }
  } catch (err) {
    console.error('[scan:graph]', err instanceof Error ? err.message.slice(0, 60) : 'fail')
    return { data: null, error: 'graph-ingest-fehlgeschlagen' }
  }
}

// Self-registering (aufgerufen von register-write.ts -> safeRegister('graph', ...)).
export function registerGraphIngest(): void {
  ipcMain.handle(IPC_WRITE.graphIngest, () => handleGraphIngest())
}
