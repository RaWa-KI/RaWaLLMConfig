import type { Category, ConfigEntry } from '@shared/contract'
import { mcpNames } from './mcp-scan'

export function isMcpServerEntry(entry: ConfigEntry): boolean {
  return entry.id.startsWith('mcp-') || Boolean(entry.fields?.Transport)
}

export function markMcpConflicts(mcpCategory: Category, scanCategory: Category | null): Category {
  if (!scanCategory) return mcpCategory

  const mcpSet = mcpNames(mcpCategory)
  const scanMcpEntries = scanCategory.entries.filter(isMcpServerEntry)
  const scanSet = new Set(scanMcpEntries.map((entry) => entry.name))
  const onlyInMcp = new Set([...mcpSet].filter((name) => !scanSet.has(name)))
  const onlyInScan = new Set([...scanSet].filter((name) => !mcpSet.has(name)))

  if (onlyInMcp.size === 0 && onlyInScan.size === 0) return scanCategory

  const entries = scanCategory.entries.map((entry) => {
    if (!isMcpServerEntry(entry) || !onlyInScan.has(entry.name)) return entry
    return {
      ...entry,
      status: 'conflict' as const,
      conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
    }
  })

  for (const entry of mcpCategory.entries) {
    if (!onlyInMcp.has(entry.name)) continue
    entries.push({
      ...entry,
      status: 'conflict',
      conflictReason: 'Nur im MCP-Register — fehlt im Plugin-Ordner',
    })
  }
  return { ...scanCategory, entries }
}
