// mcp-plugin-conflict.spec.ts — P0-Regression: Shared-Plugins wurden pauschal als
// "Nur im MCP-Register — fehlt im Plugin-Ordner" gemeldet, obwohl die Ordner da sind.
// Deckt BEIDE Richtungen ab: vorhandenes Plugin = kein Konflikt; Registereintrag
// ohne Ordner = seit 2026-07-27 ebenfalls KEIN Konflikt (Dokulage: npx-/URL-Server
// haben per Design keinen Ordner), sondern ein normaler aktiver Eintrag.
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Category, ConfigEntry } from '../../shared/contract'
import { markMcpConflicts } from '../../src/main/scan/mcp-conflicts'
import { detectPluginTransport, pluginManifestPath } from '../../src/main/scan/mcp-manifest'

function entry(id: string, name: string, fields?: Record<string, string>): ConfigEntry {
  return { id, name, status: 'active', scope: 'shared', path: name, desc: '', updated: '', fields }
}

function category(entries: ConfigEntry[]): Category {
  return { id: 'shared-plugins', label: 'Plugins', icon: 'plug', path: '', blurb: '', entries }
}

function sandbox(): string {
  return mkdtempSync(join(tmpdir(), 'rawallm-mcp-'))
}

// Fall (a): reale Shared-Plugins (rkwc-core, impl-system) ohne MCP-Deklaration.
test('vorhandene Plugins erzeugen keinen MCP-Konflikt', () => {
  const scanCategory = category([
    entry('shared-plugins-rkwc-core', 'rkwc-core'),
    entry('shared-plugins-impl-system', 'impl-system'),
  ])
  const mcpCategory = category([
    entry('mcp-shared-rkwc-core', 'rkwc-core', { Transport: 'stdio' }),
    entry('mcp-shared-impl-system', 'impl-system', { Transport: 'stdio' }),
  ])

  const result = markMcpConflicts(mcpCategory, scanCategory)

  expect(result.entries).toHaveLength(2)
  expect(result.entries.every((item: ConfigEntry) => item.status === 'active')).toBe(true)
  expect(result.entries.some((item: ConfigEntry) => Boolean(item.conflictReason))).toBe(false)
})

// Fall (b): Registereintrag ohne Ordner ist KEIN Konflikt (Owner-Entscheid +
// Dokulage Anthropic/OpenAI/Moonshot, 2026-07-27): global registrierte
// MCP-Server per npx/uvx oder URL haben per Design keinen Ordner. Der Eintrag
// bleibt als normaler aktiver Eintrag sichtbar — die fruehere Semantik
// ("weiterhin Konflikt, kein blinder Fleck") erzeugte systematisch
// Falschpositive (Owner-Fall: playwright in ~/.codex/config.toml).
test('MCP-Eintrag ohne zugehoerigen Plugin-Ordner ist aktiv, kein Konflikt', () => {
  const result = markMcpConflicts(
    category([entry('mcp-shared-playwright', 'playwright', { Transport: 'stdio' })]),
    category([entry('shared-plugins-rkwc-core', 'rkwc-core')]),
  )

  expect(result.entries.find((item: ConfigEntry) => item.name === 'rkwc-core')?.status).toBe('active')
  expect(result.entries.find((item: ConfigEntry) => item.name === 'playwright')).toMatchObject({
    status: 'active',
  })
  expect(result.entries.find((item: ConfigEntry) => item.name === 'playwright')?.conflictReason).toBeUndefined()
})

// Ordner-Existenz allein ist kein MCP-Server mehr; .mcp.json ist das Kriterium.
test('nur .mcp.json macht einen Plugin-Ordner zum MCP-Server', () => {
  const root = sandbox()
  const plain = join(root, 'rkwc-core')
  mkdirSync(join(plain, '.claude-plugin'), { recursive: true })
  writeFileSync(join(plain, '.claude-plugin', 'plugin.json'), '{"name":"rkwc-core"}', 'utf8')
  mkdirSync(join(plain, 'skills'), { recursive: true })

  const withMcp = join(root, 'echter-server')
  mkdirSync(withMcp, { recursive: true })
  writeFileSync(
    join(withMcp, '.mcp.json'),
    '{"mcpServers":{"echter-server":{"command":"node"}}}',
    'utf8',
  )

  expect(detectPluginTransport(plain)).toBeNull()
  expect(detectPluginTransport(withMcp)).toBe('stdio')
})

// Der Eintrags-Pfad muss auf das eigene Manifest zeigen, nicht auf den Sammelordner
// (sonst scheitert "Bearbeiten" mit error:'ordner').
test('Manifest-Pfad zeigt auf die eigene Datei des Plugins', () => {
  const root = sandbox()
  const dir = join(root, 'rkwc-core')
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  const manifest = join(dir, '.claude-plugin', 'plugin.json')
  writeFileSync(manifest, '{"name":"rkwc-core"}', 'utf8')

  expect(pluginManifestPath(dir)).toBe(manifest)

  const mcpFile = join(dir, '.mcp.json')
  writeFileSync(mcpFile, '{"mcpServers":{"rkwc-core":{"command":"node"}}}', 'utf8')
  expect(pluginManifestPath(dir)).toBe(mcpFile)
})
