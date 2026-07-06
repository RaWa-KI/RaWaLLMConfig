// c12-audit-reference.spec.ts — Batch 3.5 WP C-12.
// Beweist: Standalone-Archivieren meldet Inbound-Refs; Graph-Ignore und
// prefs:set schreiben Audit. Nur temp-Sandbox, keine realen Config-Pfade.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyWrite, applyDirAction } from '../../src/main/services/apply'
import { handleWriteIgnore } from '../../src/main/ipc-write-ignore'
import { initPrefsStore, handlePrefsSet } from '../../src/main/ipc-write-prefs'
import { makeSandbox, seedFile } from './fixtures'

function setSandboxEnv(root: string): () => void {
  const saved = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = root
  return () => {
    if (saved === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = saved
  }
}

function seedWorkspaceRegistry(sandboxRoot: string): string {
  const wsRoot = join(sandboxRoot, 'project')
  const registryDir = join(sandboxRoot, '.shared', '.claude', 'coordination', 'registry')
  mkdirSync(registryDir, { recursive: true })
  mkdirSync(wsRoot, { recursive: true })
  writeFileSync(
    join(registryDir, 'workspaces.json'),
    JSON.stringify({ workspaces: { test: { name: 'Test', path_local: wsRoot } } }),
    'utf8'
  )
  return wsRoot
}

test('A4-2: Datei-Archivieren liefert Inbound-Ref-Warnfeld', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'target.md', 'TARGET')
  seedFile(sb, 'ref.md', `siehe ${target}`)
  const res = applyWrite(
    { action: 'archive', path: target },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
  )
  expect(res.error).toBeNull()
  expect(res.data!.inboundRefCount).toBeGreaterThan(0)
  expect(res.data!.inboundRefs).toContain('ref.md')
})

test('A4-2: Ordner-Archivieren liefert Inbound-Ref-Warnfeld', () => {
  const sb = makeSandbox()
  const dir = join(sb.configDir, 'bundle')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'entry.md'), 'ENTRY', 'utf8')
  seedFile(sb, 'dir-ref.md', `siehe ${dir}`)
  const res = applyDirAction(
    { action: 'archive-dir', path: dir },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
  )
  expect(res.error).toBeNull()
  expect(res.data!.inboundRefCount).toBeGreaterThan(0)
  expect(res.data!.inboundRefs).toContain('dir-ref.md')
})

test('A7-1: graphWriteIgnore schreibt Audit-Eintrag', () => {
  const sb = makeSandbox()
  const sandboxRoot = join(sb.root, 'graph-sandbox')
  const restore = setSandboxEnv(sandboxRoot)
  try {
    const wsRoot = seedWorkspaceRegistry(sandboxRoot)
    const res = handleWriteIgnore({ wsRoot, scope: 'gitignore', content: 'dist\n' })
    expect(res.error).toBeNull()
    const audit = readFileSync(join(sandboxRoot, 'audit-log.jsonl'), 'utf8')
    expect(audit).toContain('"action":"graph-write-ignore"')
    expect(audit).toContain('"path":".gitignore"')
  } finally {
    restore()
  }
})

test('A7-2: prefs:set schreibt Audit-Eintrag', async () => {
  const sb = makeSandbox()
  const sandboxRoot = join(sb.root, 'prefs-sandbox')
  mkdirSync(sandboxRoot, { recursive: true })
  const restore = setSandboxEnv(sandboxRoot)
  try {
    await initPrefsStore()
    const res = await handlePrefsSet({ key: 'theme', value: 'audit-test' })
    expect(res.error).toBeNull()
    const audit = readFileSync(join(sandboxRoot, 'audit-log.jsonl'), 'utf8')
    expect(audit).toContain('"action":"prefs-set"')
  } finally {
    restore()
  }
})
