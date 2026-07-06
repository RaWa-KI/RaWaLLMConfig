// archive-collision.spec.ts — HR7-Schutz (P1): zwei gleichnamige Dateien aus
// VERSCHIEDENEN Verzeichnissen am selben Tag archivieren -> BEIDE Archive
// existieren (kein lautloser Overwrite durch identischen Zielnamen). Reine temp.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { archiveDest } from '../../src/main/services/backup'
import { applyWrite } from '../../src/main/services/apply'
import { makeSandbox } from './fixtures'

test('archiveDest: zwei gleichnamige Dateien -> zwei distinkte Archivpfade', () => {
  const sb = makeSandbox()
  const a = archiveDest('/x/dir-a/CLAUDE.md', sb.archiveRoot)
  const b = archiveDest('/x/dir-b/CLAUDE.md', sb.archiveRoot)
  expect(a.error).toBeNull()
  expect(b.error).toBeNull()
  // Selbst bei identischem Sub-Sekunden-Stamp werden die Zielpfade unterschiedlich.
  expect(a.data).not.toBe(b.data)
})

test('archive: zwei CLAUDE.md aus verschiedenen Dirs -> beide Archive existieren', () => {
  const sb = makeSandbox()
  const dirA = join(sb.configDir, 'a')
  const dirB = join(sb.configDir, 'b')
  mkdirSync(dirA, { recursive: true })
  mkdirSync(dirB, { recursive: true })
  const fileA = join(dirA, 'CLAUDE.md')
  const fileB = join(dirB, 'CLAUDE.md')
  writeFileSync(fileA, 'INHALT-A', 'utf8')
  writeFileSync(fileB, 'INHALT-B', 'utf8')
  const opts = { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
  const resA = applyWrite({ action: 'archive', path: fileA }, opts)
  const resB = applyWrite({ action: 'archive', path: fileB }, opts)
  expect(resA.error).toBeNull()
  expect(resB.error).toBeNull()
  // Beide Archive existieren und tragen die ORIGINAL-Inhalte (kein Overwrite).
  expect(existsSync(resA.data!.movedTo!)).toBe(true)
  expect(existsSync(resB.data!.movedTo!)).toBe(true)
  expect(resA.data!.movedTo).not.toBe(resB.data!.movedTo)
  expect(readFileSync(resA.data!.movedTo!, 'utf8')).toBe('INHALT-A')
  expect(readFileSync(resB.data!.movedTo!, 'utf8')).toBe('INHALT-B')
})
