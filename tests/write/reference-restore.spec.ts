// reference-restore.spec.ts — C-06/A4-1: Restore nach Rueck-Move schreibt
// Referenzen von refsPointTo wieder auf toPath. Nur temp-Sandbox-Fixtures.
import { test, expect } from '@playwright/test'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { restoreBackup } from '../../src/main/services/archive-restore'
import type { RestoreCtx } from '../../src/main/services/archive-restore'
import { scanReferences } from '../../src/main/services/integrity/reference-scan'
import { makeSandbox, sandboxPath, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'

function ctxFor(sb: Sandbox): RestoreCtx {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

function dayDir(sb: Sandbox): string {
  const d = join(sb.archiveRoot, '2026-06-09-phase2-write')
  mkdirSync(d, { recursive: true })
  return d
}

test('restoreBackup schreibt Referenzen von refsPointTo zurueck auf toPath', async () => {
  const sb = makeSandbox()
  const original = sandboxPath(sb, 'rules', 'alpha.md')
  const moved = sandboxPath(sb, 'rules', 'beta.md')
  const backup = join(dayDir(sb), 'alpha.md.142233-123.bak')
  mkdirSync(join(sb.configDir, 'rules'), { recursive: true })
  writeFileSync(backup, 'ALPHA AUS BACKUP', 'utf8')
  seedFile(sb, 'index.md', `Pflichtreferenz: ${moved}\nWikilink: [[beta]]\n`)

  const res = restoreBackup({ backupPath: backup, toPath: original, refsPointTo: moved }, ctxFor(sb))

  expect(res.error).toBeNull()
  expect(readFileSync(original, 'utf8')).toBe('ALPHA AUS BACKUP')
  const indexText = readFileSync(sandboxPath(sb, 'index.md'), 'utf8')
  expect(indexText).toContain(original)
  expect(indexText).not.toContain(moved)
  const remaining = await scanReferences(moved, original, { allowedRoots: [sb.configDir] })
  expect(remaining.ops).toHaveLength(0)
})

test('restoreBackup rollt Ziel zurueck wenn Referenz-Rewrite scheitert', () => {
  const sb = makeSandbox()
  const original = sandboxPath(sb, 'rules', 'restore-rollback.md')
  const moved = sandboxPath(sb, 'rules', 'restore-rollback-moved.md')
  const backup = join(dayDir(sb), 'restore-rollback.md.142233-456.bak')
  const index = sandboxPath(sb, 'index.md')
  mkdirSync(join(sb.configDir, 'rules'), { recursive: true })
  writeFileSync(original, 'VORHER', 'utf8')
  writeFileSync(backup, 'AUS BACKUP', 'utf8')
  writeFileSync(index, `Ref: ${moved}\n`, 'utf8')

  chmodSync(index, 0o444)
  try {
    const res = restoreBackup({ backupPath: backup, toPath: original, refsPointTo: moved }, ctxFor(sb))
    expect(res.error).not.toBeNull()
    expect(readFileSync(original, 'utf8')).toBe('VORHER')
  } finally {
    chmodSync(index, 0o666)
  }
})
