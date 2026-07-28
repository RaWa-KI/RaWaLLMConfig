// mcp-manifest.ts — Erkennung von MCP-Deklarationen + Transport-Ableitung
// (read-only). HR27-Sofort-Split aus mcp-scan.ts: dort blieb die Quellen-/
// Familien-Logik, hier liegt der Concern "Was ist ueberhaupt ein MCP-Server und
// welches Manifest gehoert dazu".
// Liest ausschliesslich STRUKTUR (Schluesselnamen), nie env-/token-/url-WERTE.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Echte MCP-Deklaration laut Claude-Code-Plugins-Referenz: .mcp.json.
// Klassische Server-Manifeste gelten nur, wenn sie wirklich url/command tragen.
const MCP_DECLARATIONS = ['.mcp.json', 'mcp.json']
const LEGACY_MCP_MANIFESTS = ['mcp_server.json', 'server.json']
// Reine Plugin-Manifeste — nur Pfad-Anker fuer "Bearbeiten", nie MCP-Beleg.
// Aktuelle Claude-Code-Struktur legt das Manifest unter .claude-plugin/plugin.json.
const PLUGIN_MANIFESTS = [join('.claude-plugin', 'plugin.json'), 'plugin.json', 'manifest.json']

// Transport-Typ aus einem einzelnen Server-Eintrag ableiten — ohne Werte.
export function claudeTransport(cfg: unknown): string {
  if (!cfg || typeof cfg !== 'object') return 'unbekannt'
  const rec = cfg as Record<string, unknown>
  if (typeof rec.type === 'string' && rec.type) return rec.type
  if (typeof rec.url === 'string') return 'http'
  if (typeof rec.command === 'string') return 'stdio'
  return 'unbekannt'
}

// Dateiname einer Top-Level-MCP-Deklaration (".mcp.json" / "mcp.json").
export function isMcpDeclarationFile(name: string): boolean {
  return MCP_DECLARATIONS.some((m) => m.toLowerCase() === name.toLowerCase())
}

// Anzeigename einer Top-Level-Deklaration (".mcp.json" -> "mcp").
export function mcpFileName(name: string): string {
  return name.replace(/^\./, '').replace(/\.json$/i, '')
}

// Transport aus einer .mcp.json ableiten. Standardform ist { "mcpServers": {...} }.
export function transportFromMcpJson(filePath: string): string {
  try {
    const json = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const servers = json.mcpServers
    if (servers && typeof servers === 'object') {
      const first = Object.values(servers as Record<string, unknown>)[0]
      return first ? claudeTransport(first) : 'unbekannt'
    }
    return claudeTransport(json)
  } catch {
    return 'unbekannt'
  }
}

// Transport aus den Schluesseln eines klassischen Server-Manifests ableiten.
// null = kein MCP-Server (Manifest ohne Start-/Endpunkt-Angabe).
function transportFromManifest(filePath: string): string | null {
  try {
    const json = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    const keys = new Set(Object.keys(json).map((k) => k.toLowerCase()))
    if (keys.has('url') || keys.has('baseurl') || keys.has('endpoint')) return 'http'
    if (keys.has('command') || keys.has('cmd') || keys.has('bin')) return 'stdio'
    return null
  } catch {
    return null
  }
}

// Transport eines Plugin-Ordners — NUR bei echter MCP-Deklaration.
// Kein Ordner-Fallback mehr: der alte Fallback stufte jeden existierenden Ordner
// als "plugin-bundle"-MCP-Server ein und erzeugte flaechendeckende Falsch-Konflikte.
export function detectPluginTransport(pluginDir: string): string | null {
  for (const m of MCP_DECLARATIONS) {
    const fp = join(pluginDir, m)
    if (existsSync(fp)) return transportFromMcpJson(fp)
  }
  for (const m of LEGACY_MCP_MANIFESTS) {
    const fp = join(pluginDir, m)
    if (!existsSync(fp)) continue
    const transport = transportFromManifest(fp)
    if (transport) return transport
  }
  return null
}

// Eigener Manifest-Pfad eines Plugins (DATEI, nicht Sammelordner) — damit
// "Bearbeiten" nicht mit error:'ordner' scheitert. Reihenfolge: MCP-Deklaration,
// klassisches Server-Manifest, Plugin-Manifest.
export function pluginManifestPath(pluginDir: string): string {
  for (const m of [...MCP_DECLARATIONS, ...LEGACY_MCP_MANIFESTS, ...PLUGIN_MANIFESTS]) {
    const fp = join(pluginDir, m)
    if (existsSync(fp)) return fp
  }
  return pluginDir
}
