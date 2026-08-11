import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { scanAll, scanAllAsync } from '../../src/main/scan/scan-index'

// Statischer Import statt require + Cache-Bust: die Scan-Module loesen ihre
// Wurzeln seit 2026-08-10 bei JEDEM Aufruf ueber configRoots() auf (reine
// Funktion von RAWALLM_SANDBOX_ROOT). Ein einmal geladenes Modul bleibt damit
// an keinen Sandbox-Pfad gebunden — Env setzen genuegt.

function w(file: string, content: string): string {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

function seedAuditSandbox(root: string): void {
  w(join(root, 'project', 'docs', 'index.md'), 'Kaputt: [[nicht-existent]].\n')
  w(join(root, 'project', 'src', 'too-long.ts'), Array.from({ length: 310 }, (_, i) => `const x${i} = ${i}`).join('\n'))
  w(join(root, '.codex', 'agents', 'alpha', 'MEMORY.md'), '- [_memory/foo.md]\n')
  w(join(root, '.codex', 'agents', 'alpha', '_memory', 'bar.md'), '# bar\n')
  w(join(root, '.claude', 'hooks', 'unused.cjs'), 'console.log("unused")\n')
  w(join(root, '.claude', 'settings.json'), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node hooks/missing.cjs' }] }] },
  }, null, 2))
  w(join(root, '.codex', 'hooks.json'), JSON.stringify({ hooks: {} }, null, 2))
  w(join(root, '.shared', '.claude', 'coordination', 'registry', 'workspaces.json'), JSON.stringify({
    workspaces: { broken: { path_local: join(root, 'missing-ws') } },
  }, null, 2))
  w(join(root, '.shared', '.claude', 'coordination', 'registry', 'governance-dependencies.json'), '{}\n')
}

function seedDoctorSandbox(root: string): void {
  const claude = join(root, '.claude')
  const project = join(root, 'project')
  const plugin = join(claude, 'plugins', 'cache', 'demo-market', 'demo', '1.0.0')
  const knownMarket = join(claude, 'plugins', 'marketplaces', 'shared-market')
  const sharedRuntime = join(root, '.shared', '.claude', 'plugins', 'shared-market')
  const sentinel = 'SENTINEL_DOCTOR_SECRET'
  w(join(root, '.claude.json'), JSON.stringify({
    projects: {
      [project]: {},
      [project.toLowerCase().replace(/\\/g, '/')]: {},
    },
    mcpServers: { browser: { url: `http://127.0.0.1:8830/mcp?token=${sentinel}` } },
    skillUsage: { unused: { usageCount: 0 } },
  }))
  w(join(claude, 'settings.json'), JSON.stringify({
    enabledPlugins: { 'demo@demo-market': true },
    extraKnownMarketplaces: { 'shared-market': { source: { source: 'directory', path: sharedRuntime } } },
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: 'node hooks/missing.cjs' }] }],
      PreToolUse: [{ hooks: [{ type: 'command', command: 'node hooks/risky.cjs', timeout: 3 }] }],
    },
  }))
  w(join(project, '.mcp.json'), JSON.stringify({
    mcpServers: { projectBrowser: { url: 'http://127.0.0.1:8830/mcp' } },
  }))
  w(join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ plugins: {
    'demo@demo-market': [{ version: '1.0.0', scope: 'user', installPath: plugin, usageCount: 0 }],
  } }))
  w(join(claude, 'plugins', 'known_marketplaces.json'), JSON.stringify({
    'shared-market': { installLocation: knownMarket, source: { source: 'directory', path: knownMarket } },
  }))
  w(join(knownMarket, '.claude-plugin', 'marketplace.json'), JSON.stringify({
    name: 'shared-market', plugins: [{ name: 'demo', source: './demo', defaultEnabled: true }],
  }))
  w(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'demo', version: '1.0.0' }))
  w(join(claude, 'agents', 'local.md'), '---\nname: duplicate-agent\n---\n')
  w(join(plugin, 'agents', 'plugin.md'), '---\nname: duplicate-agent\n---\n')
  w(join(claude, 'skills', 'unused', 'SKILL.md'), `---\nname: unused\ndescription: ${'x'.repeat(200)}\n---\n`)
  w(join(claude, 'hooks', 'risky.cjs'), 'function deliver() { saveState(); emit(); return MAX_MISSING }\n')
  w(join(claude, 'projects', 'fixture', 'recent.jsonl'), [
    { type: 'attachment', attachment: { type: 'hook_cancelled', hookName: 'risky.cjs',
      hookEvent: 'PreToolUse:Bash', durationMs: 3_500, timedOut: true, timeoutMs: 3_000 } },
    { type: 'attachment', attachment: { type: 'hook_error_during_execution', hookName: 'risky.cjs',
      hookEvent: 'PreToolUse:Bash', errorClass: 'ReferenceError', undefinedIdentifier: 'MAX_MISSING', message: sentinel } },
  ].map((row) => JSON.stringify(row)).join('\n'))
  w(join(claude, 'plugins', 'cache', 'demo-market', 'nested', 'temp_git_orphan', 'payload.txt'), 'orphan')
  w(join(sharedRuntime, 'marker.txt'), 'shared runtime')
  w(join(root, '.shared', '.claude', 'coordination', 'registry', 'localhost-ports.json'), JSON.stringify({
    ports: { playwright: { service: 'playwright', port: 8830, protocol: 'http' } },
  }))
}

let sandboxRoot = ''

test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-audit-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
  process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET = '20'
  seedAuditSandbox(sandboxRoot)
  seedDoctorSandbox(sandboxRoot)
})

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  delete process.env.SLASH_COMMAND_TOOL_CHAR_BUDGET
  rmSync(sandboxRoot, { recursive: true, force: true })
})

test('scanAll exposes C-04/C-10 scanner findings as audit family categories', () => {
  const app = scanAll()
  const audit = app.data.audit
  expect(audit).toBeDefined()
  const cats = new Map(audit.categories.map((cat) => [cat.id, cat]))
  for (const id of ['audit-references', 'audit-registry', 'audit-hooks', 'audit-hr27', 'audit-memory']) {
    expect(cats.get(id)?.entries.length, `${id} entries`).toBeGreaterThan(0)
    expect(cats.get(id)?.entries.every((entry) => entry.status === 'conflict')).toBe(true)
  }
  // Masterplan Teil E (E-WP3 L2): audit ist Register-only — die Daten bleiben
  // (Assertions oben), aber die Familie bekommt keinen Pseudo-Tab mehr; die
  // Befunde erscheinen einmalig unter „Abdeckung & Register".
  expect(app.llms.some((llm) => llm.id === 'audit')).toBe(false)
})

test('scanAll and scanAllAsync expose every D1-D11 detector through sandbox roots', async () => {
  const apps = [scanAll(), await scanAllAsync()]

  for (const app of apps) {
    const category = app.data.audit.categories.find((item) => item.id === 'audit-claude-doctor')
    const rules = category?.entries[0]?.fields?.Regeln?.split(', ') ?? []
    expect(rules).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'])
    expect(category?.entries[0]?.status).toBe('conflict')
    expect(app.llms.some((llm) => llm.id === 'audit')).toBe(false)
    expect(JSON.stringify(category)).not.toContain('SENTINEL_DOCTOR_SECRET')
  }
  const syncDoctor = apps[0].data.audit.categories.find((item) => item.id === 'audit-claude-doctor')
  const asyncDoctor = apps[1].data.audit.categories.find((item) => item.id === 'audit-claude-doctor')
  expect(asyncDoctor).toEqual(syncDoctor)
})
