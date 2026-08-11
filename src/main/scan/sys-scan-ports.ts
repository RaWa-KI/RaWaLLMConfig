// sys-scan-ports.ts — Areas aus der localhost-ports.json-Registry + die
// Live-Reconciliation lokaler LLM-Quellen, aus sys-scan.ts extrahiert
// (HR27-Split, WP2 2026-07-28). Registry = Zusatzinfo, nie live geprueft:
// alle Eintraege tragen fileBacked === false und erzeugen aus KEINEM Pfad
// eine Diagnosekarte. Die live erkannte/verbundene Quelle (Env-Namen,
// Dateisystem, verbundene Modellordner) ist die fuehrende Wahrheit.
// Kein Netzwerk-Probing (Local-Only), keine Secrets.
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'
import type { EntryStatus, SystemArea } from '@shared/contract'
import { ggufRoots } from './llm-scan'
import { userSourceRootsForProvider } from '../services/config-roots'

// Ports nach Status klassifizieren — active/reserved -> active, stale -> stale, conflict-risk -> conflict.
function portStatus(s: string | undefined): EntryStatus {
  if (s === 'active') return 'active'
  if (s === 'conflict-risk' || s === 'conflict') return 'conflict'
  if (s === 'stale') return 'stale'
  return 'active'
}

// ── Areas aus localhost-ports.json (real, kein Secret) ──────────────────
interface PortRow { port?: number; protocol?: string; service?: string; host?: string; status?: string; ws?: string }
export interface PortsDoc { ports?: Record<string, PortRow> }

function pickPorts(doc: PortsDoc | null, match: RegExp): SystemArea['entries'] {
  if (!doc?.ports) return []
  return Object.entries(doc.ports)
    .filter(([id, r]) => match.test(id) || match.test(r.service ?? ''))
    .map(([id, r]) => ({
      id,
      name: r.service ?? id,
      status: portStatus(r.status),
      v: r.port != null ? `:${r.port}` : '—',
      desc: `${r.protocol ?? 'http'} · ${r.host ?? '127.0.0.1'} · ${r.status ?? 'reserved'}`,
      // Registry-Eintraege sind Zusatzinfo, keine live gepruefte Wahrheit
      // (WP2): sie erzeugen aus KEINEM Pfad eine Diagnosekarte.
      fileBacked: false,
      fields: { Port: String(r.port ?? '—'), Host: r.host ?? '127.0.0.1', Status: r.status ?? 'reserved' }
    }))
}

// ── Live-Evidenz lokaler Dienste (WP2: eine Quellen-Wahrheit) ────────────
// ports.json beschreibt den Cross-Maschinen-Sollbestand der Registry — auf
// DIESEM Rechner zaehlt nur die live erkannte/verbundene Quelle.
export interface LocalLiveEvidence {
  ollama: boolean
  models: boolean
}

function collectLocalLiveEvidence(): LocalLiveEvidence {
  const ollamaEnv = Object.keys(process.env).some((key) => key.startsWith('OLLAMA'))
  const ollamaModels = typeof process.env.OLLAMA_MODELS === 'string' && fs.existsSync(process.env.OLLAMA_MODELS)
  const sourceRoots = userSourceRootsForProvider('local')
  return {
    ollama: ollamaEnv || ollamaModels || fs.existsSync(path.join(homedir(), '.ollama'))
      || sourceRoots.some((root) => /ollama/i.test(root)),
    models: ggufRoots().some((root) => fs.existsSync(root))
  }
}

// Die live erkannte/verbundene Quelle ist die fuehrende Wahrheit: ein
// Registry-Eintrag, dessen Dienst per Env/Ordner/Quelle vorhanden ist, gilt
// als 'active' — der Registry-Status bleibt sichtbare Zusatzinfo, ist aber
// nie ein eigener Fehlergrund (Root-Cause 2026-07-28: ports.json meldete
// LLMS_ollama 'stale' („Ollama deinstalliert", Stand 2026-06-03), waehrend
// OLLAMA_* gesetzt und der Modellordner verbunden war -> Falsch-Karte).
function reconcileLocalEntry(entry: SystemArea['entries'][number], evidence: LocalLiveEvidence): SystemArea['entries'][number] {
  const isOllama = /ollama/i.test(`${entry.id ?? ''} ${entry.name}`)
  const live = isOllama ? evidence.ollama : evidence.models
  if (!live || entry.status === 'active') return entry
  const registry = entry.fields?.Status ?? entry.status
  return {
    ...entry,
    status: 'active',
    desc: entry.desc.replace(/ · [^·]*$/, ` · live erkannt (Registry: ${registry})`),
    fields: { ...entry.fields, Status: 'live erkannt', 'Registry-Status': registry }
  }
}

export function localLlmArea(doc: PortsDoc | null, evidence: LocalLiveEvidence = collectLocalLiveEvidence()): SystemArea {
  const entries = pickPorts(doc, /llama|ollama|brain|searxng|local/i)
    .map((entry) => reconcileLocalEntry(entry, evidence))
  return { id: 'localllm', label: 'Lokale LLM', icon: 'sparkle', blurb: 'llama-server, Brain-Adapter, GGUF.', entries }
}

export function dbArea(doc: PortsDoc | null): SystemArea {
  const entries = pickPorts(doc, /mariadb|mysql|neo4j/i)
  return { id: 'databases', label: 'Datenbanken', icon: 'db', blurb: 'MariaDB, MySQL, Neo4j.', entries }
}
