// scan-claude-plugins.ts — Claude Top-Level Plugin-/Marketplace-Inventar +
// maskierte Struktur-Vorschau. Ausgelagert aus scan-helpers.ts (HR27-Split).
// Read-only; Secret-Werte werden NIE roh getragen (maskSecrets vor Preview).
// F1-Fix: maskedPreview lebt jetzt in masked-preview.ts (zyklenfrei); hier nur
// Re-Export, damit bestehende Consumer (claude-scan/codex-scan) nichts brechen.
import fs from 'node:fs'
import path from 'node:path'
import type { ConfigEntry } from '@shared/contract'
import { mtimeSafe, readTextSafe } from './scan-helpers'
import { maskedPreview } from './masked-preview'

// Re-Export: maskedPreview wurde nach masked-preview.ts ausgelagert (F1), bleibt
// hier als kompatible Export-Stelle erhalten.
export { maskedPreview }

// ── Claude installierte Plugins (Top-Level installed_plugins.json) ─────────

// Ein installiertes Plugin (Owner-Override #1): name@marketplace -> Version/
// Scope aus dem ersten Install-Record. Roh-Werte sind Pfade/Versionen, keine
// Secrets — aber die Quell-JSON wird per maskedPreview getragen (defensiv).
interface ClaudePluginEntryShape {
  name: string
  marketplace: string
  version: string
  scope: string
  installedAt: string
}

// Plugin-Map-Eintrag (Array von Install-Records) auf Anzeige-Form reduzieren.
function shapeClaudePlugin(key: string, value: unknown): ClaudePluginEntryShape {
  const [name, marketplace = ''] = key.split('@')
  const rec = Array.isArray(value) ? (value[0] as Record<string, unknown>) : {}
  const str = (k: string): string => (typeof rec[k] === 'string' ? (rec[k] as string) : '')
  return {
    name: name || key,
    marketplace,
    version: str('version'),
    scope: str('scope'),
    installedAt: (str('installedAt') || str('lastUpdated')).slice(0, 10),
  }
}

// installed_plugins.json + known_marketplaces.json read-only parsen und je
// installiertem Plugin einen ConfigEntry liefern (path = installed_plugins.json,
// code = maskierte Vorschau). Parse-Fehler -> ein Fehler-Entry, KEIN Crash.
export function collectClaudeInstalledPlugins(idPrefix: string, pluginsDir: string): ConfigEntry[] {
  const installedFp = path.join(pluginsDir, 'installed_plugins.json')
  const marketFp = path.join(pluginsDir, 'known_marketplaces.json')
  if (!fs.existsSync(installedFp)) return []
  const text = readTextSafe(installedFp)
  if (text === undefined) return []
  const preview = maskedPreview(installedFp)
  let parsed: { plugins?: Record<string, unknown> }
  try {
    parsed = JSON.parse(text) as { plugins?: Record<string, unknown> }
  } catch (err) {
    // Dirty Config: Befund im Entry dokumentieren, nicht crashen.
    return [{
      id: `${idPrefix}-installed-plugins`, name: 'installed_plugins.json',
      status: 'conflict', scope: 'global', path: installedFp,
      desc: `JSON-Parse-Fehler: ${(err as Error).message.slice(0, 60)}`,
      conflictReason: 'JSON-Parse-Fehler in installed_plugins.json',
      updated: mtimeSafe(installedFp), fields: { typ: 'installed_plugins.json' },
      code: preview || undefined,
    }]
  }
  const marketNames = readMarketplaceNames(marketFp)
  const plugins = parsed.plugins ?? {}
  const out: ConfigEntry[] = []
  for (const [key, value] of Object.entries(plugins)) {
    const sh = shapeClaudePlugin(key, value)
    const fields: Record<string, string> = { typ: 'installed_plugins.json' }
    if (sh.version) fields.version = sh.version
    if (sh.marketplace) fields.marketplace = sh.marketplace
    if (sh.scope) fields.scope = sh.scope
    if (marketNames.length) fields.marketplaces = marketNames.slice(0, 8).join(', ')
    out.push({
      id: `${idPrefix}-${key}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: sh.name, status: 'active', scope: 'global', path: installedFp,
      desc: sh.marketplace ? `Plugin aus ${sh.marketplace}` : 'Installiertes Plugin',
      updated: sh.installedAt || mtimeSafe(installedFp), fields,
      code: preview || undefined,
      // Inventar: N Eintraege teilen sich installed_plugins.json (WP-07) ->
      // kein eigenes Umbenennen-/Verschieben-Ziel (Renderer blendet Aktionen aus).
      inventory: true,
    })
  }
  return out
}

// Marketplace-Namen aus known_marketplaces.json (nur Keys, keine Secret-Werte).
function readMarketplaceNames(marketFp: string): string[] {
  if (!fs.existsSync(marketFp)) return []
  const text = readTextSafe(marketFp)
  if (text === undefined) return []
  try {
    return Object.keys(JSON.parse(text) as Record<string, unknown>)
  } catch {
    return []
  }
}
