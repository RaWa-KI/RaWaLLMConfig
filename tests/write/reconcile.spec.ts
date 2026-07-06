// reconcile.spec.ts — Diff + Reconcile gegen temp-Sandbox (NIE reale Config).
// Sichert: echter Zeilen-Diff (ctx/add/del), KEIN Auto-Merge (decision Pflicht),
// trunk-first-Reihenfolge (Trunk-Pre-Snapshot vor edit, Mirror DANACH archiviert,
// kein Loeschen), Abbruch laesst Mirror stehen. Alle Pfade temp via fixtures.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { diffLines } from '../../src/main/services/diff-lines'
import { reconcile } from '../../src/main/services/reconcile'
import { makeSandbox, seedFile, sandboxPath, exists } from './fixtures'
import type { Sandbox } from './fixtures'

function opts(sb: Sandbox): { archiveRoot: string; auditPath: string } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

test('diffLines klassifiziert ctx/add/del mit trunk/mirror-Flags korrekt', () => {
  const trunk = 'a\nb\nc\n'
  const mirror = 'a\nx\nc\n'
  const lines = diffLines(trunk, mirror)
  // gemeinsame Zeilen a + c sind ctx (both); b nur Trunk (del/trunkOnly); x nur Mirror (add/mirrorOnly).
  const ctx = lines.filter((l) => l.t === 'ctx')
  const del = lines.filter((l) => l.t === 'del')
  const add = lines.filter((l) => l.t === 'add')
  expect(ctx.map((l) => l.l)).toEqual(['a', 'c'])
  expect(ctx.every((l) => l.both === true)).toBe(true)
  expect(del).toHaveLength(1)
  expect(del[0]).toMatchObject({ l: 'b', trunkOnly: true })
  expect(add).toHaveLength(1)
  expect(add[0]).toMatchObject({ l: 'x', mirrorOnly: true })
})

test('diffLines bei identischem Inhalt nur ctx (kein add/del)', () => {
  const lines = diffLines('same\nlines\n', 'same\nlines\n')
  expect(lines.every((l) => l.t === 'ctx')).toBe(true)
})

test('reconcile verweigert ohne gueltige Entscheidung (KEIN Auto-Merge)', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'T-ALT')
  const mirror = seedFile(sb, 'mirror.md', 'M-NEU')
  // decision fehlt/ungueltig -> Fehler, NICHTS wird geschrieben oder archiviert.
  const res = reconcile(
    { trunkPath: trunk, mirrorPath: mirror, decision: 'merge-all' as never },
    opts(sb)
  )
  expect(res.error).toBe('invalid-decision')
  expect(readFileSync(trunk, 'utf8')).toBe('T-ALT')
  expect(existsSync(mirror)).toBe(true)
})

test('adopt-mirror: Trunk-Pre-Snapshot, Trunk uebernimmt Mirror, Mirror DANACH archiviert', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'TRUNK-EIGEN\nzeile2\n')
  const mirror = seedFile(sb, 'mirror.md', 'MIRROR-INHALT\nzeile2\n')
  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'adopt-mirror' }, opts(sb))
  expect(res.error).toBeNull()
  // Trunk-Pre-Snapshot vor edit vorhanden (alte Trunk-Zeilen darin erhalten).
  expect(res.data!.trunkBackupPath).toBeTruthy()
  expect(exists(res.data!.trunkBackupPath!)).toBe(true)
  expect(readFileSync(res.data!.trunkBackupPath!, 'utf8')).toContain('TRUNK-EIGEN')
  // Trunk hat jetzt den Mirror-Inhalt (bewusste Ganzdatei-Entscheidung).
  expect(readFileSync(trunk, 'utf8')).toBe('MIRROR-INHALT\nzeile2\n')
  // Mirror wurde DANACH archiviert (Quelle weg, Archiv da, kein Loeschen).
  expect(existsSync(mirror)).toBe(false)
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(exists(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(readFileSync(res.data!.mirrorArchivedTo!, 'utf8')).toBe('MIRROR-INHALT\nzeile2\n')
})

test('keep-trunk: Trunk byte-identisch erhalten, Mirror archiviert (kein Loeschen)', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'TRUNK-EIGEN\nbleibt\n')
  const mirror = seedFile(sb, 'mirror.md', 'MIRROR-WEG\n')
  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'keep-trunk' }, opts(sb))
  expect(res.error).toBeNull()
  // Trunk unveraendert (Trunk-eigene Zeilen erhalten).
  expect(readFileSync(trunk, 'utf8')).toBe('TRUNK-EIGEN\nbleibt\n')
  expect(res.data!.trunkBackupPath).toBeNull()
  // Mirror archiviert (nicht geloescht).
  expect(existsSync(mirror)).toBe(false)
  expect(exists(res.data!.mirrorArchivedTo!)).toBe(true)
})

test('adopt-trunk: Mirror-Pre-Snapshot, Mirror uebernimmt Trunk, Trunk DANACH archiviert', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'TRUNK-INHALT\nzeile2\n')
  const mirror = seedFile(sb, 'mirror.md', 'MIRROR-EIGEN\nzeile2\n')
  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'adopt-trunk' }, opts(sb))
  expect(res.error).toBeNull()
  // Mirror-Pre-Snapshot vor edit vorhanden (alte Mirror-Zeilen darin erhalten).
  expect(res.data!.trunkBackupPath).toBeTruthy()
  expect(exists(res.data!.trunkBackupPath!)).toBe(true)
  expect(readFileSync(res.data!.trunkBackupPath!, 'utf8')).toContain('MIRROR-EIGEN')
  // Mirror hat jetzt den Trunk-Inhalt (bewusste Ganzdatei-Entscheidung).
  expect(readFileSync(mirror, 'utf8')).toBe('TRUNK-INHALT\nzeile2\n')
  // Trunk wurde DANACH archiviert (Quelle weg, Archiv da, kein Loeschen).
  expect(existsSync(trunk)).toBe(false)
  expect(res.data!.mirrorArchivedTo).toBeTruthy()
  expect(exists(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(readFileSync(res.data!.mirrorArchivedTo!, 'utf8')).toBe('TRUNK-INHALT\nzeile2\n')
})

test('keep-mirror: Mirror byte-identisch erhalten, Trunk archiviert (kein Loeschen)', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'TRUNK-WEG\n')
  const mirror = seedFile(sb, 'mirror.md', 'MIRROR-EIGEN\nbleibt\n')
  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'keep-mirror' }, opts(sb))
  expect(res.error).toBeNull()
  // Mirror unveraendert (Mirror-eigene Zeilen erhalten).
  expect(readFileSync(mirror, 'utf8')).toBe('MIRROR-EIGEN\nbleibt\n')
  expect(res.data!.trunkBackupPath).toBeNull()
  // Trunk archiviert (nicht geloescht).
  expect(existsSync(trunk)).toBe(false)
  expect(exists(res.data!.mirrorArchivedTo!)).toBe(true)
  expect(readFileSync(res.data!.mirrorArchivedTo!, 'utf8')).toBe('TRUNK-WEG\n')
})

test('Abbruch bei fehlendem Archiv laesst Mirror UND Trunk stehen (keine Teilmutation)', () => {
  const sb = makeSandbox()
  const trunk = seedFile(sb, 'trunk.md', 'T-ORIG')
  const mirror = seedFile(sb, 'mirror.md', 'M-ORIG')
  // archiveRoot fehlt -> backup-first bricht apply VOR jeder Mutation ab.
  const res = reconcile(
    { trunkPath: trunk, mirrorPath: mirror, decision: 'adopt-mirror' },
    { archiveRoot: join(sb.root, 'no-archive-here'), auditPath: sb.auditPath }
  )
  expect(res.error).toBe('archive-missing')
  expect(readFileSync(trunk, 'utf8')).toBe('T-ORIG') // Trunk unveraendert
  expect(existsSync(mirror)).toBe(true) // Mirror steht noch (nicht archiviert)
})

test('reconcile verweigert secret-bearing Zielpfad (guard-first)', () => {
  const sb = makeSandbox()
  const trunk = sandboxPath(sb, 'settings.json') // secret-bearing
  const mirror = seedFile(sb, 'mirror.md', 'M')
  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'adopt-mirror' }, opts(sb))
  expect(res.error).toBe('owner-only/not-in-scope')
  expect(existsSync(mirror)).toBe(true)
})
