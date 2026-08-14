// mcp-scan.ts — MCP-Server je Tool-Familie (read-only). Liest NUR Servernamen +
// Transport-Typ zur Laufzeit. NIE Secret-/Token-/env-WERTE lesen oder tragen.
// Quellen: Claude ~/.claude.json (Feld mcpServers), Codex ~/.codex/config.toml
// (Sektionen [mcp_servers.*]), Shared .shared/.claude/plugins (Plugin-Bundles).
// Jede fs-Op in try/catch; bei Fehler stderr-Log ohne Secret und leeres Ergebnis.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import type { Category, ConfigEntry, EntryStatus, Scope } from '@shared/contract'
import { isSecretPathForRead } from '../services/secret-guard'
import { configRoots } from '../services/config-roots'
import { invalidConfigEntry } from './scan-invalid-entry'
import {
  claudeTransport,
  detectPluginTransport,
  isMcpDeclarationFile,
  mcpFileName,
  pluginManifestPath,
  transportFromMcpJson,
} from './mcp-manifest'

// Quell-Pfade aus der Single Source. .claude.json liegt NEBEN ~/.claude (parent
// von claudeHome), config.toml unter codexHome. Default = real (M1 unveraendert);
// mit RAWALLM_SANDBOX_ROOT zeigen beide unter <sandbox>.
function claudeJsonPath() {
  return join(dirname(configRoots().claudeHome), '.claude.json')
}
function codexTomlPath() {
  return join(configRoots().codexHome, 'config.toml')
}
function sharedPluginsDir() {
  const shared = configRoots().sharedClaude
  return shared ? join(shared, 'plugins') : null
}

// SSOT-Vertrag: Quellen wie ~/.claude.json und config.toml sind echte Secret-
// WERT-Klassen (isSecretPathForRead === true). mcp-scan parst sie AUSSCHLIESSLICH
// strukturell (Servernamen + Transport-Schluessel), surface NIE Werte/env/Token.
const MCP_SOURCES_ARE_SECRET_BEARING = true

// Eine Familien-Kategorie (id="plugins") aus Server-Namen+Transport bauen.
// path je Server ist optional: Shared-Eintraege tragen ihr EIGENES Manifest,
// damit "Bearbeiten" eine Datei oeffnet und nicht am Sammelordner scheitert.
function buildCategory(
  filePath: string,
  scope: Scope,
  servers: { name: string; transport: string; status?: EntryStatus; path?: string }[]
): Category {
  const entries: ConfigEntry[] = servers.map((s) =>
    mcpEntry(s.name, s.transport, s.path ?? filePath, scope, s.status)
  )
  return {
    id: 'plugins',
    label: 'Plugins / MCP',
    icon: 'plug',
    path: filePath,
    blurb: 'Konfigurierte MCP-Server (Namen + Transport, keine Token).',
    entries
  }
}

// Fehler-Kategorie statt null: kaputte Strukturquellen duerfen nicht wie "leer"
// aussehen, weil sonst MCP-Config-Probleme in der UI verschwinden.
function invalidMcpCategory(
  displayPath: string,
  realPath: string,
  scope: Scope,
  id: string,
  err: unknown,
  kind: string
): Category {
  return {
    id: 'plugins',
    label: 'Plugins / MCP',
    icon: 'plug',
    path: displayPath,
    blurb: 'Konfigurierte MCP-Server (Namen + Transport, keine Token).',
    entries: [invalidConfigEntry(id, 'MCP-Konfiguration fehlerhaft', realPath, err, kind)]
      .map((entry) => ({ ...entry, scope }))
  }
}

// Einzelnen MCP-Server als ConfigEntry abbilden — nur unkritische Metadaten.
function mcpEntry(
  name: string,
  transport: string,
  filePath: string,
  scope: Scope,
  status: EntryStatus = 'active'
): ConfigEntry {
  return {
    id: `mcp-${scope}-${name}`,
    name,
    status,
    scope,
    path: filePath,
    desc: `MCP-Server (${transport})`,
    updated: '',
    fields: { Transport: transport, Quelle: basename(filePath) },
    // Roh-Auszug NUR aus strukturellen Daten (Name + Transport + Quell-Basename).
    // KEINE env/url/command/token-Werte — Konflikt-Eintraege zeigen so einen
    // wertfreien Block statt leerer Rohkonfiguration.
    code: `"${name}": { "type": "${transport}" }  // Quelle: ${basename(filePath)}`
  }
}

// (claudeTransport liegt seit dem HR27-Split in mcp-manifest.ts)

// Strukturelle Quelle freigeben: nur secret-bearing Strukturquellen (SSOT) werden
// rein strukturell geparst (Namen/Transport), nie inhaltlich gesurft.
function isStructuralSource(p: string): boolean {
  return MCP_SOURCES_ARE_SECRET_BEARING && isSecretPathForRead(p)
}

// Claude: ~/.claude.json, Feld mcpServers (Top-Level). Nur Namen + Transport.
function scanClaudeMcp(): Category | null {
  const filePath = claudeJsonPath()
  try {
    if (!existsSync(filePath) || !isStructuralSource(filePath)) return null
    const raw = readFileSync(filePath, 'utf8')
    const json = JSON.parse(raw) as Record<string, unknown>
    const servers = json.mcpServers
    if (!servers || typeof servers !== 'object') return null
    const list = Object.entries(servers as Record<string, unknown>).map(([name, cfg]) => ({
      name,
      transport: claudeTransport(cfg)
    }))
    if (list.length === 0) return null
    return buildCategory('~/.claude.json', 'global', list)
  } catch (err) {
    console.error('[scan:mcp-claude]', err instanceof Error ? err.message : 'parse-error')
    return invalidMcpCategory(
      '~/.claude.json',
      filePath,
      'global',
      'mcp-global-claude-config-invalid',
      err,
      'JSON-Parse-Fehler',
    )
  }
}

// Server-Name aus einer [mcp_servers.NAME]-TOML-Headerzeile extrahieren.
function parseServerHeader(line: string): string | null {
  const m = line.match(/^\[mcp_servers\.([^.\]]+)\]\s*$/)
  return m ? m[1] : null
}

// Transport aus einem gesammelten TOML-Server-Block ableiten — nur Schluessel.
function tomlTransport(keys: Set<string>): string {
  if (keys.has('url')) return 'http'
  if (keys.has('command')) return 'stdio'
  return 'unbekannt'
}

// Eine einzelne config.toml-Zeile innerhalb eines Server-Blocks verarbeiten.
function consumeTomlLine(line: string, keys: Set<string>): boolean {
  if (!line || line.startsWith('#')) return true
  if (/^\[/.test(line)) return false
  const eq = line.indexOf('=')
  if (eq > 0) {
    const key = line.slice(0, eq).trim()
    if (key) keys.add(key)
    return true
  }
  throw new Error('Ungueltige TOML-Zeile im MCP-Server-Block')
}

// Codex: ~/.codex/config.toml, Sektionen [mcp_servers.*].
function scanCodexMcp(): Category | null {
  const filePath = codexTomlPath()
  try {
    if (!existsSync(filePath) || !isStructuralSource(filePath)) return null
    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
    const servers = collectTomlServers(lines)
    if (servers.length === 0) return null
    return buildCategory('~/.codex/config.toml', 'global', servers)
  } catch (err) {
    console.error('[scan:mcp-codex]', err instanceof Error ? err.message : 'parse-error')
    return invalidMcpCategory(
      '~/.codex/config.toml',
      filePath,
      'global',
      'mcp-global-codex-config-invalid',
      err,
      'TOML-Parse-Fehler',
    )
  }
}

// Server-Liste aus TOML-Zeilen sammeln (Name + abgeleiteter Transport).
function collectTomlServers(lines: string[]): { name: string; transport: string }[] {
  const servers: { name: string; transport: string }[] = []
  let current: string | null = null
  let keys = new Set<string>()
  const flush = (): void => {
    if (current) servers.push({ name: current, transport: tomlTransport(keys) })
  }
  for (const rawLine of lines) {
    const line = rawLine.trim()
    const header = parseServerHeader(line)
    if (header) {
      flush()
      current = header
      keys = new Set<string>()
      continue
    }
    if (current && !consumeTomlLine(line, keys)) {
      flush()
      current = null
      keys = new Set<string>()
    }
  }
  flush()
  return servers
}

// Shared: .shared/.claude/plugins — MCP-Server werden ausschliesslich ueber eine
// echte Deklaration erkannt (.mcp.json bzw. klassisches Server-Manifest mit
// url/command). Ein blosser Ordner oder ein Plugin-Manifest ist KEIN MCP-Server:
// der alte Ordner-Fallback hat jedes Plugin als MCP-Server ausgegeben und damit
// flaechendeckend Falsch-Konflikte erzeugt.
// NIE Secret-Werte lesen — nur Namen + Transport-Schluessel.
function scanSharedMcp(): Category | null {
  try {
    const pluginsDir = sharedPluginsDir()
    if (!pluginsDir) return null
    if (!existsSync(pluginsDir)) return null
    const servers: { name: string; transport: string; path: string }[] = []
    const entries = readdirSync(pluginsDir, { withFileTypes: true })
    for (const d of entries) {
      if (isSecretPathForRead(d.name)) continue
      if (d.isDirectory()) {
        if (d.name.startsWith('.')) continue
        const dir = join(pluginsDir, d.name)
        const transport = detectPluginTransport(dir)
        // path zeigt auf das eigene Manifest des Plugins, nicht auf den Sammelordner
        if (transport) servers.push({ name: d.name, transport, path: pluginManifestPath(dir) })
      } else if (d.isFile() && isMcpDeclarationFile(d.name)) {
        // Top-Level-Deklaration (.mcp.json / mcp.json) fuer den Plugins-Ordner
        const fp = join(pluginsDir, d.name)
        servers.push({ name: mcpFileName(d.name), transport: transportFromMcpJson(fp), path: fp })
      }
    }
    if (servers.length === 0) return null
    return buildCategory(pluginsDir, 'shared', servers)
  } catch (err) {
    console.error('[scan:mcp-shared]', err instanceof Error ? err.message : 'scan-error')
    return null
  }
}

// (MCP-Deklarations-/Manifest-Erkennung liegt seit dem HR27-Split in mcp-manifest.ts)

// Namen-Set aus einer MCP-Kategorie extrahieren (fuer Konflikt-Erkennung).
export function mcpNames(cat: Category | null): Set<string> {
  if (!cat) return new Set()
  return new Set(cat.entries.map((e) => e.name))
}

// Oeffentliche API: je Familie eine Plugins/MCP-Kategorie oder null.
export function scanMcp(): { claude: Category | null; codex: Category | null; shared: Category | null } {
  return {
    claude: scanClaudeMcp(),
    codex: scanCodexMcp(),
    shared: scanSharedMcp()
  }
}
