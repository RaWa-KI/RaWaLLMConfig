import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { AppData } from '../../shared/contract'

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (k.includes('/src/main/scan/') || k.includes('/src/main/services/')) delete require.cache[key]
  }
}

function loadScanAll(): () => AppData {
  bustScanCache()
  return (require('../../src/main/scan/scan-index') as { scanAll: () => AppData }).scanAll
}

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

let sandboxRoot = ''

test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-audit-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
  seedAuditSandbox(sandboxRoot)
})

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  bustScanCache()
  rmSync(sandboxRoot, { recursive: true, force: true })
})

test('scanAll exposes C-04/C-10 scanner findings as audit family categories', () => {
  const app = loadScanAll()()
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
