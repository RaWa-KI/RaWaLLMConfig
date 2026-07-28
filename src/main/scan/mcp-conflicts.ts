import type { Category, ConfigEntry } from '@shared/contract'
import { mcpNames } from './mcp-scan'

export function isMcpServerEntry(entry: ConfigEntry): boolean {
  return entry.id.startsWith('mcp-') || Boolean(entry.fields?.Transport)
}

// "Ist im Plugin-Ordner vorhanden?" wird auf NAMENSBASIS gegen ALLE Eintraege der
// Plugins-Kategorie geprueft. Der frueher benutzte MCP-Filter (id-Praefix `mcp-`
// oder Feld `Transport`) trifft auf real gescannte Plugin-Ordner nie zu — das Set
// blieb leer und JEDES registrierte Plugin wurde als "fehlt im Plugin-Ordner"
// gemeldet. Zusaetzlich wird die Endung abgeschnitten, damit ein Eintrag
// `foo.json` auch den Registernamen `foo` abdeckt.
function presentNames(scanCategory: Category): Set<string> {
  const names = new Set<string>()
  for (const entry of scanCategory.entries) {
    if (!entry.name) continue
    names.add(entry.name)
    const withoutExt = entry.name.replace(/\.[a-z0-9]+$/i, '')
    if (withoutExt) names.add(withoutExt)
  }
  return names
}

export function markMcpConflicts(mcpCategory: Category, scanCategory: Category | null): Category {
  if (!scanCategory) return mcpCategory

  const mcpSet = mcpNames(mcpCategory)
  const presentSet = presentNames(scanCategory)
  const scanMcpEntries = scanCategory.entries.filter(isMcpServerEntry)
  const scanSet = new Set(scanMcpEntries.map((entry) => entry.name))
  // Nur-im-Ordner bleibt bewusst auf echte MCP-Server begrenzt: ein normaler
  // Plugin-/Skill-Ordner ohne MCP-Deklaration ist kein fehlender Registereintrag.
  const onlyInScan = new Set([...scanSet].filter((name) => !mcpSet.has(name)))

  const entries = scanCategory.entries.map((entry) => {
    if (!isMcpServerEntry(entry) || !onlyInScan.has(entry.name)) return entry
    return {
      ...entry,
      status: 'conflict' as const,
      conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
    }
  })

  // Registereintraege OHNE gleichnamigen Ordner werden als normale aktive
  // Eintraege uebernommen — seit 2026-07-27 (Owner-Entscheid + Dokulage
  // Anthropic/OpenAI/Moonshot) ausdruecklich KEIN Konflikt mehr: global
  // registrierte MCP-Server per npx/uvx oder URL (Claude ~/.claude.json,
  // Codex config.toml [mcp_servers.*], Kimi ~/.kimi-code/mcp.json) haben per
  // Design keinen Ordner. Das ist der dokumentierte Normalfall, kein Fehler.
  // Zuvor erzeugte diese Richtung systematisch Falschpositive ("Nur im
  // MCP-Register — fehlt im Plugin-Ordner"), u. a. beim Owner-Fall playwright
  // in ~/.codex/config.toml.
  for (const entry of mcpCategory.entries) {
    if (presentSet.has(entry.name)) continue
    entries.push(entry)
  }
  if (entries.length === scanCategory.entries.length && onlyInScan.size === 0) return scanCategory
  return { ...scanCategory, entries }
}
