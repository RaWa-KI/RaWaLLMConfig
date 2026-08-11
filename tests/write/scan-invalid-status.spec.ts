// scan-invalid-status.spec.ts — WP C-03 (Befund A1-6): eine Config-Datei mit
// KAPUTTEM JSON darf nicht mehr als LEERE Kategorie ("leer & gesund")
// erscheinen, sondern muss EINEN sichtbaren Befund-Entry liefern (Variante A:
// status:'conflict' + conflictReason, wie scan-claude-plugins.ts). Runner:
// Playwright (test/expect) als reiner Node-Runner (kein Browser).
//
// WICHTIG: claude-scan.ts loest claudeDir() seit 2026-08-10 bei JEDEM Aufruf
// ueber configRoots() auf (reine Funktion von RAWALLM_SANDBOX_ROOT) — kein
// Modul-Konstanten-Freeze beim Load mehr. Deshalb reicht der statische Import:
// Env setzen, Scanner aufrufen. Die Ziel-Datei settings.json wird bei JEDEM Call
// frisch gelesen -> pro Test einfach neu schreiben (kaputt/valide). Secret-frei:
// nur synthetische Test-Configs, keine echten Werte.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { collectHooks, collectSettings } from '../../src/main/scan/claude-scan'
import { scanMcp } from '../../src/main/scan/mcp-scan'

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
  try {
    rmSync(sandbox, { recursive: true, force: true })
  } catch {
    /* Temp-Cleanup best effort */
  }
})

test('kaputte settings.json => genau 1 conflict-Entry statt leerer Kategorie', () => {
  writeFileSync(settingsFp, '{ "permissions": { bruch ', 'utf8')
  const entries = collectSettings()
  expect(entries.length, 'genau 1 sichtbarer Befund statt []').toBe(1)
  expect(entries[0].status).toBe('conflict')
  expect(entries[0].conflictReason ?? '').toContain('JSON-Parse-Fehler')
  expect(entries[0].path.endsWith('settings.json')).toBe(true)
})

test('kaputte Hook-settings => mind. 1 conflict-Entry mit Begruendung', () => {
  writeFileSync(settingsFp, '{ "hooks": kaputt ', 'utf8')
  const entries = collectHooks()
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
  const entries = collectSettings()
  expect(entries.length).toBe(1)
  expect(entries[0].status).toBe('active')
})

test('kaputte .claude.json MCP-Quelle => conflict-Kategorie statt null', () => {
  writeFileSync(claudeJsonFp, '{ "mcpServers": kaputt ', 'utf8')
  const category = scanMcp().claude
  expect(category, 'Claude-MCP-Kategorie bleibt sichtbar').not.toBeNull()
  expect(category?.entries).toHaveLength(1)
  expect(category?.entries[0].status).toBe('conflict')
  expect(category?.entries[0].conflictReason ?? '').toContain('JSON-Parse-Fehler')
})

test('kaputte Codex MCP-TOML => conflict-Kategorie statt null', () => {
  writeFileSync(claudeJsonFp, JSON.stringify({ mcpServers: {} }), 'utf8')
  writeFileSync(codexConfigFp, '[mcp_servers.demo]\ncommand "node"\n', 'utf8')
  const category = scanMcp().codex
  expect(category, 'Codex-MCP-Kategorie bleibt sichtbar').not.toBeNull()
  expect(category?.entries).toHaveLength(1)
  expect(category?.entries[0].status).toBe('conflict')
  expect(category?.entries[0].conflictReason ?? '').toContain('TOML-Parse-Fehler')
})
