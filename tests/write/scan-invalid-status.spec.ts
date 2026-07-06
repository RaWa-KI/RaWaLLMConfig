// scan-invalid-status.spec.ts — WP C-03 (Befund A1-6): eine Config-Datei mit
// KAPUTTEM JSON darf nicht mehr als LEERE Kategorie ("leer & gesund")
// erscheinen, sondern muss EINEN sichtbaren Befund-Entry liefern (Variante A:
// status:'conflict' + conflictReason, wie scan-claude-plugins.ts). Runner:
// Playwright (test/expect) als reiner Node-Runner (kein Browser).
//
// WICHTIG: claude-scan.ts loest claudeDir MODUL-KONSTANT beim Load auf
// (const claudeDir = configRoots().claudeHome). Ein dynamisches import() einer
// .ts-Quelle scheitert unter Playwright (Cannot use import statement outside a
// module) und wuerde ausserdem einen bereits statisch geladenen Modulgraphen
// (echtes ~/.claude) nicht neu binden. Deshalb: CommonJS require + Cache-Bust
// (wie builddata-equivalence.spec.ts). RAWALLM_SANDBOX_ROOT wird VOR dem require
// gesetzt, der Scan-Subtree-Cache verworfen -> claudeDir loest frisch auf
// <sandbox>/.claude auf. Die Ziel-Datei settings.json wird bei JEDEM Call frisch
// gelesen -> pro Test einfach neu schreiben (kaputt/valide). Secret-frei:
// nur synthetische Test-Configs, keine echten Werte.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ── Fresh-Load-Harness (1:1 aus builddata-equivalence.spec.ts) ──────────────
// Scan-/Service-Module aus dem require-Cache werfen, damit ihre modul-gebundenen
// *Dir-Konstanten unter dem aktuellen RAWALLM_SANDBOX_ROOT neu aufgeloest werden.
function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (
      k.includes('/src/main/scan/') ||
      k.includes('/src/main/services/') ||
      k.includes('/shared/contract')
    ) {
      delete require.cache[key]
    }
  }
}

// claude-scan frisch aus DEMSELBEN Modulgraph laden, NACHDEM die Sandbox-Env
// gesetzt und der Cache verworfen wurde -> claudeDir zeigt in die Sandbox.
function loadClaudeScan(): typeof import('../../src/main/scan/claude-scan') {
  bustScanCache()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/main/scan/claude-scan')
}

function loadMcpScan(): typeof import('../../src/main/scan/mcp-scan') {
  bustScanCache()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../../src/main/scan/mcp-scan')
}

let sandbox: string
let claudeDir: string
let settingsFp: string
let claudeJsonFp: string
let codexDir: string
let codexConfigFp: string

test.beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'rawallm-invalid-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  claudeDir = join(sandbox, '.claude')
  codexDir = join(sandbox, '.codex')
  mkdirSync(claudeDir, { recursive: true })
  mkdirSync(codexDir, { recursive: true })
  settingsFp = join(claudeDir, 'settings.json')
  claudeJsonFp = join(sandbox, '.claude.json')
  codexConfigFp = join(codexDir, 'config.toml')
})

test.afterAll(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  // Cache erneut verwerfen (ohne Sandbox-Env) -> Scan-Module binden wieder an die
  // realen Wurzeln, damit nachfolgende Specs im Worker nicht am toten Sandbox-
  // Pfad haengen.
  bustScanCache()
  try {
    rmSync(sandbox, { recursive: true, force: true })
  } catch {
    /* Temp-Cleanup best effort */
  }
})

test('kaputte settings.json => genau 1 conflict-Entry statt leerer Kategorie', () => {
  writeFileSync(settingsFp, '{ "permissions": { bruch ', 'utf8')
  const mod = loadClaudeScan()
  const entries = mod.collectSettings()
  expect(entries.length, 'genau 1 sichtbarer Befund statt []').toBe(1)
  expect(entries[0].status).toBe('conflict')
  expect(entries[0].conflictReason ?? '').toContain('JSON-Parse-Fehler')
  expect(entries[0].path.endsWith('settings.json')).toBe(true)
})

test('kaputte Hook-settings => mind. 1 conflict-Entry mit Begruendung', () => {
  writeFileSync(settingsFp, '{ "hooks": kaputt ', 'utf8')
  const mod = loadClaudeScan()
  const entries = mod.collectHooks()
  const conflict = entries.filter((e) => e.status === 'conflict')
  expect(conflict.length, 'Hook-Kategorie zeigt Befund statt leer').toBeGreaterThan(0)
  expect(conflict.some((e) => (e.conflictReason ?? '').includes('JSON-Parse-Fehler'))).toBe(true)
})

test('valide settings.json => genau 1 active-Entry (keine Regression)', () => {
  writeFileSync(
    settingsFp,
    JSON.stringify({ permissions: { deny: [], allow: [] }, env: {} }, null, 2),
    'utf8',
  )
  const mod = loadClaudeScan()
  const entries = mod.collectSettings()
  expect(entries.length).toBe(1)
  expect(entries[0].status).toBe('active')
})

test('kaputte .claude.json MCP-Quelle => conflict-Kategorie statt null', () => {
  writeFileSync(claudeJsonFp, '{ "mcpServers": kaputt ', 'utf8')
  const mod = loadMcpScan()
  const category = mod.scanMcp().claude
  expect(category, 'Claude-MCP-Kategorie bleibt sichtbar').not.toBeNull()
  expect(category?.entries).toHaveLength(1)
  expect(category?.entries[0].status).toBe('conflict')
  expect(category?.entries[0].conflictReason ?? '').toContain('JSON-Parse-Fehler')
})

test('kaputte Codex MCP-TOML => conflict-Kategorie statt null', () => {
  writeFileSync(claudeJsonFp, JSON.stringify({ mcpServers: {} }), 'utf8')
  writeFileSync(codexConfigFp, '[mcp_servers.demo]\ncommand "node"\n', 'utf8')
  const mod = loadMcpScan()
  const category = mod.scanMcp().codex
  expect(category, 'Codex-MCP-Kategorie bleibt sichtbar').not.toBeNull()
  expect(category?.entries).toHaveLength(1)
  expect(category?.entries[0].status).toBe('conflict')
  expect(category?.entries[0].conflictReason ?? '').toContain('TOML-Parse-Fehler')
})
