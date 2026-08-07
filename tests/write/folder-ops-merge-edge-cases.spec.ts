import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeSandbox } from './fixtures'
import type { DirReconcileRequest } from '@shared/contract-write'
import { ctx, previewAndApply } from './integrity-helpers'

function makeDir(parent: string, name: string, files: Record<string, string>): string {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return dir
}

test('Partial-Failure: Secret-Datei bleibt unangetastet', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-pf', {
    'normal.md': 'NORMAL-TRUNK',
    'settings.json': '{"t":true}'
  })
  const mirror = makeDir(sb.configDir, 'mirror-pf', {
    'normal.md': 'NORMAL-MIRROR',
    'settings.json': '{"m":true}'
  })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: {
      'settings.json': 'adopt-mirror',
      'normal.md': 'adopt-mirror'
    }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
  expect(existsSync(join(trunk, 'settings.json'))).toBe(true)
})

test('Partial-Failure bei fehlendem Archiv-Root: keine Mutation ohne Snapshot', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-pfar', { 'x.md': 'X-TRUNK' })
  const mirror = makeDir(sb.configDir, 'mirror-pfar', { 'x.md': 'X-MIRROR' })
  const missingRoot = join(sb.configDir, 'no-archive')
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'x.md': 'adopt-mirror' }
  }
  const run = await previewAndApply(
    { kind: 'reconcile-folder', req },
    { archiveRoot: missingRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data).toBeNull()
  expect(run.apply?.error).toBeTruthy()
  expect(readFileSync(join(trunk, 'x.md'), 'utf8')).toBe('X-TRUNK')
  expect(existsSync(join(mirror, 'x.md'))).toBe(true)
})

test('Re-Run-Idempotenz: zweiter Apply bleibt ohne Mutation', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-idem', { 'f.md': 'TRUNK-V1' })
  const mirror = makeDir(sb.configDir, 'mirror-idem', { 'f.md': 'MIRROR-V2' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'f.md': 'adopt-mirror' }
  }
  const first = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(first.preview.error).toBeNull()
  expect(first.apply?.error).toBeNull()
  expect(first.apply?.data?.applied).toBe(true)
  expect(readFileSync(join(trunk, 'f.md'), 'utf8')).toBe('MIRROR-V2')
  if (!existsSync(mirror)) {
    const second = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
    expect(second.preview.error).toBeNull()
    expect(second.apply?.data?.applied).toBe(false)
    expect(second.apply?.data?.partial).toBe(false)
    expect(readFileSync(join(trunk, 'f.md'), 'utf8')).toBe('MIRROR-V2')
  }
})

test('adopt-mirror: mirror-only Datei wird vom aktiven Plan sicher abgelehnt', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-mirror-only', { 'existing.md': 'EXISTING-IN-TRUNK' })
  const mirror = makeDir(sb.configDir, 'mirror-mirror-only', {
    'existing.md': 'MIRROR-VERSION',
    'only-in-mirror.md': 'MIRROR-ONLY-CONTENT'
  })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'existing.md': 'adopt-mirror', 'only-in-mirror.md': 'adopt-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
  expect(readFileSync(join(trunk, 'existing.md'), 'utf8')).toBe('EXISTING-IN-TRUNK')
  expect(existsSync(join(trunk, 'only-in-mirror.md'))).toBe(false)
  expect(existsSync(join(mirror, 'only-in-mirror.md'))).toBe(true)
})

test('Manifest-Pfade (.../SKILL.md beidseitig) -> aktiver Kanal mutiert nicht falsch', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'skill-x-trunk', {
    'SKILL.md': 'TRUNK-SKILL',
    'helper.ts': 'TRUNK-HELPER'
  })
  const mirror = makeDir(sb.configDir, 'skill-x-mirror', {
    'SKILL.md': 'MIRROR-SKILL',
    'helper.ts': 'MIRROR-HELPER'
  })
  const req: DirReconcileRequest = {
    trunkPath: join(trunk, 'SKILL.md'),
    mirrorPath: join(mirror, 'SKILL.md'),
    decisions: { 'SKILL.md': 'keep-trunk', 'helper.ts': 'keep-trunk' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
  expect(readFileSync(join(trunk, 'SKILL.md'), 'utf8')).toBe('TRUNK-SKILL')
  expect(readFileSync(join(trunk, 'helper.ts'), 'utf8')).toBe('TRUNK-HELPER')
  expect(existsSync(join(mirror, 'SKILL.md'))).toBe(true)
})

test('case-insensitive: adopt-mirror -> Apply-Journal belegt Snapshot vor Edit', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-ci', { 'README.md': 'TRUNK-README' })
  const mirror = makeDir(sb.configDir, 'mirror-ci', { 'README.md': 'MIRROR-README' })
  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'README.md': 'adopt-mirror' }
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  const entry = run.preview.data!.fsOps.find((f) => f.rel === 'README.md')
  expect(entry?.decision).toBe('adopt-mirror')
  expect(run.apply?.data?.journalPath).toBeTruthy()
  expect(existsSync(run.apply!.data!.journalPath!)).toBe(true)
  expect(readFileSync(join(trunk, 'README.md'), 'utf8')).toBe('MIRROR-README')
})
