// backup.spec.ts — HR7-Pre-Snapshot gegen temp-Archiv. Original unveraendert;
// archive-missing wenn Archiv-Root fehlt. Nie reale Pfade.
import { test, expect } from '@playwright/test'
import { readFileSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportSnapshot, resolveDefaultArchiveRoot, setArchiveRootResolver } from '../../src/main/services/backup'
import { makeSandbox, seedFile, exists } from './fixtures'

test('backup legt Pre-Snapshot im temp-Archiv an; Original unveraendert', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'rule.md', 'ORIGINAL-INHALT')
  const res = exportSnapshot(target, sb.archiveRoot)
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()
  const snap = res.data!.snapshotPath
  expect(snap.length).toBeGreaterThan(0)
  expect(exists(snap)).toBe(true)
  // Snapshot-Inhalt == Original; Original liegt noch da, unveraendert.
  expect(readFileSync(snap, 'utf8')).toBe('ORIGINAL-INHALT')
  expect(readFileSync(target, 'utf8')).toBe('ORIGINAL-INHALT')
})

test('backup -> archive-missing wenn Archiv-Root fehlt; Zieldatei unveraendert', () => {
  const sb = makeSandbox()
  const target = seedFile(sb, 'rule.md', 'INHALT')
  // Archiv-Root existiert nicht (gelöscht/nie angelegt) -> archive-missing.
  const missingRoot = join(mkdtempSync(join(tmpdir(), 'rawallm-noarch-')), 'does-not-exist')
  const res = exportSnapshot(target, missingRoot)
  expect(res.error).toBe('archive-missing')
  expect(res.data).toBeNull()
  // Zieldatei bleibt unangetastet.
  expect(readFileSync(target, 'utf8')).toBe('INHALT')
  rmSync(sb.root, { recursive: true, force: true })
})

test('default-Archivroot nutzt Env vor injizierter AppData-Quelle', () => {
  const old = process.env.RAWALLM_ARCHIVE_ROOT
  const envRoot = join(tmpdir(), 'rawallm-env-archive')
  const injectedRoot = join(tmpdir(), 'rawallm-userdata-archive')
  try {
    process.env.RAWALLM_ARCHIVE_ROOT = envRoot
    setArchiveRootResolver(() => injectedRoot)
    expect(resolveDefaultArchiveRoot()).toBe(envRoot)
  } finally {
    if (old === undefined) delete process.env.RAWALLM_ARCHIVE_ROOT
    else process.env.RAWALLM_ARCHIVE_ROOT = old
    setArchiveRootResolver(null)
  }
})
