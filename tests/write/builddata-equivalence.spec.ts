// builddata-equivalence.spec.ts — Build-Data-Gleichheits-Beweis (B-5).
// Beweist auf VOLLER AppData-/buildData-Ebene, dass die registry-getriebene
// buildData() (scanRegistry: providerRegistry()-Iteration + scanProvider) gegen
// DIESELBE Sandbox dasselbe data-Dict erzeugt wie der Bestands-Pfad
// (legacyBuildData: direkte Alt-Scanner-Aufrufe scanShared/scanClaude/scanCodex/
// scanLocalLlm + identische mergeMcp/buildUserglobal-Post-Steps).
//
// Im Gegensatz zur provider-equivalence.spec (nur categories je Provider) deckt
// dieser Beweis die LlmConfig-Ebene ab: diffLabels je Familie, llm-comingSoon-
// Frueh-Return, mergeMcp-Ergebnis (claude/codex/shared), buildUserglobal und die
// data-Schluessel-Reihenfolge (shared, claude, codex, local, userglobal).
//
// MECHANIK: Alt-Scanner, mcp-scan und die Engine loesen ihre Basis-Pfade seit
// 2026-08-10 bei JEDEM Aufruf ueber configRoots() auf (reine Funktion von
// RAWALLM_SANDBOX_ROOT). Damit genuegen statische Imports: alle Funktionen
// stammen ohnehin aus DEMSELBEN Modulgraph (gleiche scanMcp-Instanz fuer Alt-
// und Neu-Pfad) und das gesetzte Env trifft beide Pfade gleich.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LlmConfig } from '../../shared/contract'
import type { IntegrationActivation } from '../../shared/contract-integrations'
import { buildData, buildUserglobal, mergeMcp } from '../../src/main/scan/scan-index'
import { scanShared } from '../../src/main/scan/shared-scan'
import { scanClaude } from '../../src/main/scan/claude-scan'
import { scanCodex } from '../../src/main/scan/codex-scan'
import {
  LOCAL_COMING_SOON,
  LOCAL_DIFF_LABELS,
  ggufRoots,
  scanLocalLlm
} from '../../src/main/scan/llm-scan'
import { scanMcp } from '../../src/main/scan/mcp-scan'

// legacyBuildData: exakt der hartcodierte M1-Pfad (vor B-5). Reihenfolge
// shared, claude, codex, local; danach identische mergeMcp/userglobal-Steps.
function legacyBuildData(): Record<string, LlmConfig> {
  const data: Record<string, LlmConfig> = {
    shared: safeScan('shared', scanShared),
    claude: safeScan('claude', scanClaude),
    codex: safeScan('codex', scanCodex),
    local: safeScan('local', scanLocalLlm),
  }
  try {
    const mcp = scanMcp()
    mergeMcp(data.claude, mcp, 'claude')
    mergeMcp(data.codex, mcp, 'codex')
    mergeMcp(data.shared, mcp, 'shared')
  } catch (err) {
    console.error('[legacy:mcp]', err instanceof Error ? err.message : 'scan-error')
  }
  data.userglobal = buildUserglobal(data)
  return data
}

// safeScan-Aequivalent (wie scan-index/build-data) — Alt-Pfad crasht nie.
function safeScan(name: string, fn: () => LlmConfig): LlmConfig {
  try {
    return fn()
  } catch (err) {
    console.error(`[legacy:${name}]`, err instanceof Error ? err.message : 'scan-error')
    return { categories: [], duplicates: [] }
  }
}

// ── Sandbox-Seeding ─────────────────────────────────────────────────────────
function sandboxRoots(root: string): { claude: string; codex: string; shared: string } {
  return {
    claude: join(root, '.claude'),
    codex: join(root, '.codex'),
    shared: join(root, '.shared', '.claude'),
  }
}
function w(file: string, content: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content, 'utf8')
}
function md(desc: string, title: string): string {
  return ['---', `description: ${desc}`, '---', `# ${title}`, '', 'Inhalt-Zeile.', ''].join('\n')
}

function enableShared(root: string): void {
  const state: IntegrationActivation[] = [
    { id: 'core', enabled: true, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'user-sources', enabled: true, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'shared-trunk', enabled: true, paused: false, root: join(root, '.shared', '.claude'), updatedAt: '2026-07-07T00:00:00.000Z' },
    { id: 'workspace-registry', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'graphify', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'obsidian', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
    { id: 'watcher-governance', enabled: false, paused: false, root: null, updatedAt: '1970-01-01T00:00:00.000Z' },
  ]
  writeFileSync(join(root, 'integrations.json'), JSON.stringify(state, null, 2), 'utf8')
}

// Vollstaendige Sandbox fuer alle 4 Familien (deckt mergeMcp + userglobal mit ab).
function seedAll(root: string): void {
  const { claude, codex, shared } = sandboxRoots(root)
  // ── claude ──
  w(join(claude, 'skills', 'alpha', 'SKILL.md'), md('Alpha-Skill', 'Alpha'))
  w(join(claude, 'rules', 'one.md'), '# Regel Eins\n\nText.\n')
  w(join(claude, 'agents', 'bot.md'), md('Bot-Agent', 'Bot'))
  w(join(claude, 'settings.json'), JSON.stringify({
    permissions: { deny: ['a'], allow: ['b'] },
    env: { X: '1' },
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo' }] }] },
  }, null, 2))
  w(join(claude, 'hooks', 'guard.cjs'), '// hook\nmodule.exports = {}\n')
  w(join(claude, 'CLAUDE.md'), '# Globale Instruktionen\n\nText.\n')
  w(join(claude, 'teams', 'crew', 'config.json'), JSON.stringify({ name: 'Crew', members: 2 }, null, 2))
  w(join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'demo@market': [{ version: '1.0.0', scope: 'user', installedAt: '2026-06-01' }] },
  }, null, 2))
  w(join(claude, 'plugins', 'extra', 'package.json'), JSON.stringify({ name: 'extra' }, null, 2))
  // ~/.claude.json (mcp-scan Claude-Quelle, NEBEN ~/.claude) — MCP-Server fuer mergeMcp.
  w(join(root, '.claude.json'), JSON.stringify({ mcpServers: { srv1: { command: 'node' } } }, null, 2))
  // ── codex ──
  w(join(codex, 'AGENTS.md'), '# Codex Startanker\n\nText.\n')
  w(join(codex, 'pm-light.config.toml'), 'model = "x"\n')
  w(join(codex, 'config.toml'), '[profile]\nmodel = "x"\napproval_policy = "y"\n[mcp_servers.srvC]\ncommand = "node"\n')
  w(join(codex, 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'c' }] }] } }, null, 2))
  w(join(codex, 'hooks', 'h.cjs'), '// h\n')
  w(join(codex, 'skills', 's1', 'SKILL.md'), md('Skill Eins', 'S1'))
  w(join(codex, 'agents', 'a1', 'AGENT.md'), md('Agent Eins', 'A1'))
  w(join(codex, 'rules', 'r2.md'), md('Regel Zwei', 'R2'))
  w(join(codex, 'plugins', 'p1', 'plugin.json'), JSON.stringify({ name: 'p1' }, null, 2))
  w(join(codex, 'teams', 'team-a.toml'), 'name = "a"\n')
  // ── shared ──
  w(join(shared, 'agents', 'agent-x.md'), md('Agent X', 'AgentX'))
  w(join(shared, 'rules', 'rule-x.md'), md('Rule X', 'RuleX'))
  w(join(shared, 'skills', 'skill-x', 'SKILL.md'), md('Skill X', 'SkillX'))
  w(join(shared, 'hooks', 'hook-x.cjs'), '// hook x\n')
  w(join(shared, 'plugins', 'plug-x', 'plugin.json'), JSON.stringify({ name: 'plug-x' }, null, 2))
  w(join(shared, 'plugins', 'plug-x', 'agents', 'pa.md'), md('Plugin-Agent', 'PA'))
  w(join(shared, 'tools', 'tool-x.md'), md('Tool X', 'ToolX'))
  w(join(shared, 'CLAUDE.md'), '# Shared Instruktionen\n\nText.\n')
  w(join(shared, 'AGENTS.md'), '# Shared AGENTS\n\nText.\n')
  w(join(shared, 'references', 'ref-x.md'), md('Ref X', 'RefX'))
  w(join(shared, 'coordination', 'registry', 'workspaces.json'), JSON.stringify({ workspaces: {} }, null, 2))
  w(join(shared, 'coordination', 'briefings', 'b1.md'), '# b1\n')
}

let sandboxRoot = ''
test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-bdequiv-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
})
test.afterEach(() => {
  // Das Loeschen der Env genuegt: die Scan-Module haengen an keinem eingefrorenen
  // Sandbox-Pfad mehr (Wurzeln werden pro Aufruf aufgeloest), der naechste Spec
  // im selben Worker trifft also automatisch wieder die realen Wurzeln.
  delete process.env.RAWALLM_SANDBOX_ROOT
  try {
    rmSync(sandboxRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// ── Voll-AppData-Gleichheit (legacy == registry) ────────────────────────────
test('buildData (Registry) == legacyBuildData (Alt-Scanner) — deep-equal inkl. diffLabels/comingSoon/Reihenfolge', () => {
  seedAll(sandboxRoot)
  enableShared(sandboxRoot)
  const oldData = legacyBuildData()
  const newData = buildData()

  // (1) data-Schluessel: die BESTANDS-Familien bleiben unveraendert in fixer
  // Reihenfolge; 'cloud' (Teil D) ist ADDITIV nach den Legacy-4 (vor userglobal).
  // Der Alt-Pfad (legacyBuildData) kennt cloud NICHT -> Gleichheit nur auf den
  // Legacy-Familien, cloud wird separat geprueft (additive Erweiterung).
  // 'kimi' (WP-10, HR16-Paritaet) haengt wie 'cloud' ADDITIV hinter den Legacy-4.
  expect(Object.keys(oldData)).toEqual(['shared', 'claude', 'codex', 'local', 'userglobal'])
  // 'grok' (2026-08-11, HR16-Paritaet) haengt wie 'cloud'/'kimi' ADDITIV an.
  expect(Object.keys(newData)).toEqual(['shared', 'claude', 'codex', 'local', 'cloud', 'kimi', 'grok', 'userglobal'])

  // (2) diffLabels je Familie identisch (LlmConfig-Ebene, nicht nur categories).
  for (const fam of ['shared', 'claude', 'codex', 'local']) {
    expect(newData[fam].diffLabels).toEqual(oldData[fam].diffLabels)
  }
  // diffLabels muessen tatsaechlich gesetzt sein (nicht beidseitig undefined).
  expect(newData.claude.diffLabels).toBeDefined()
  expect(newData.codex.diffLabels).toBeDefined()
  expect(newData.shared.diffLabels).toBeDefined()
  expect(newData.local.diffLabels).toBeDefined()

  // (3) comingSoon je Familie identisch (nur local traegt es i.d.R.).
  for (const fam of ['shared', 'claude', 'codex', 'local']) {
    expect(newData[fam].comingSoon).toEqual(oldData[fam].comingSoon)
  }

  // (4) Volles deep-equal je BESTANDS-Familie (categories inkl. mergeMcp +
  // userglobal). oldData enthaelt genau die Legacy-Familien -> diese muessen 1:1
  // gleich bleiben (Migrations-Gleichheit der Bestaende, unberuehrt von Teil D).
  for (const fam of Object.keys(oldData)) {
    expect(newData[fam]).toEqual(oldData[fam])
  }

  // (5) Additive Cloud-Familie (Teil D): vorhanden, mit den 3 Provider-Kategorien
  // (OpenAI/Anthropic/Gemini). Metadaten-only -> nie ein Key-WERT im Ergebnis.
  expect(newData.cloud).toBeDefined()
  expect(newData.cloud.categories.length).toBe(3)
  expect(JSON.stringify(newData.cloud)).not.toContain('dummy')
})

// Der inhaltliche Kimi-Beweis (Familie befuellt, userglobal-Uebernahme,
// credentials nur klassifiziert) liegt in kimi-family.spec.ts — hier bleibt nur
// die Schluessel-Reihenfolge, damit diese Datei unter dem HR27-Limit bleibt.

// ── llm-comingSoon-Frueh-Return (Modellroot-fehlt-Branch) ───────────────────
// Modellroots liegen ausserhalb der Sandbox. Fehlen alle Roots, MUSS data.local
// der byte-identische comingSoon-Frueh-Return sein (LEERE categories + diffLabels
// + comingSoon), nicht die 2 Engine-Kategorien. Bei vorhandenem Root liefern
// beide Pfade dieselben 2 Kategorien (durch das Voll-deep-equal oben abgedeckt).
test('llm-comingSoon: ohne Modellroot liefern beide Pfade den leeren comingSoon-Return', () => {
  seedAll(sandboxRoot)
  enableShared(sandboxRoot)
  const oldLocal = legacyBuildData().local
  const newLocal = buildData().local

  expect(newLocal).toEqual(oldLocal)
  if (!ggufRoots().some((root) => existsSync(root))) {
    // Kein Modellroot -> exakter Frueh-Return aus scanLocalLlm.
    expect(newLocal.categories).toEqual([])
    expect(newLocal.diffLabels).toEqual(LOCAL_DIFF_LABELS)
    expect(newLocal.comingSoon).toEqual(LOCAL_COMING_SOON)
  } else {
    // Mindestens ein Modellroot vorhanden -> 2 Kategorien, kein comingSoon.
    expect(newLocal.categories.map((c) => c.id)).toEqual(['gguf-models', 'llm-endpoints'])
    expect(newLocal.comingSoon).toBeUndefined()
  }
})
