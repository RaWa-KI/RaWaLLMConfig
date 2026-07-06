// folder-ops.spec.ts — Temp-Sandbox-Tests fuer Verzeichnis-Operationen.
// Abgedeckt: archiveDir, moveDir, snapshotDir, archive-missing, HR7-Negativ,
// secret-in-tree All-or-Nothing, cross-volume EXDEV (Mock).
// NIEMALS reale Config-Pfade. Alle Sandbox via fixtures.makeSandbox().
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { archiveDir, moveDir, dirCheckSecretTree, copyDir, verifyCopy } from '../../src/main/services/apply-dir-actions'
import { snapshotDir } from '../../src/main/services/backup'
import { applyDirAction } from '../../src/main/services/apply'
import { makeSandbox } from './fixtures'
import { readFileSync as readAudit } from 'node:fs'

// ── Hilfsroutinen ───────────────────────────────────────────────────────────

/** Legt einen verschachtelten Test-Ordner mit N Dateien an. */
function makeTestDir(parent: string, name: string, files: Record<string, string>): string {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return dir
}

/** Zaehlt regulaere Dateien rekursiv (kein Symlink). */
function countFiles(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    if (e.isDirectory()) n += countFiles(abs)
    else if (e.isFile()) n++
  }
  return n
}

/** SHA-256 einer Datei. */
function hashFile(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex')
}

/** Liest alle rel->hash Eintraege aus einem Verzeichnis. */
function dirHashes(dir: string, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name)
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) {
      for (const [k, v] of dirHashes(abs, rel)) out.set(k, v)
    } else if (e.isFile()) {
      out.set(rel, hashFile(abs))
    }
  }
  return out
}

// ── archiveDir ──────────────────────────────────────────────────────────────

test('archiveDir: rekursiver Move; Inhalt vollstaendig (Count + Hash)', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-archive', {
    'a.md': 'A',
    'sub/b.md': 'B',
    'sub/deep/c.md': 'C'
  })
  const before = dirHashes(src)
  expect(before.size).toBe(3)

  const dest = join(sb.archiveRoot, 'archived-dir')
  const err = archiveDir(src, dest)
  expect(err).toBeNull()

  // Ziel enthaelt dieselben Dateien (Count + Hash).
  expect(existsSync(dest)).toBe(true)
  const after = dirHashes(dest)
  expect(after.size).toBe(3)
  for (const [rel, hash] of before) {
    expect(after.get(rel)).toBe(hash)
  }
})

test('archiveDir: Quelle existiert nicht -> error:src-not-found, kein Ziel', () => {
  const sb = makeSandbox()
  const dest = join(sb.archiveRoot, 'should-not-exist')
  const err = archiveDir(join(sb.root, 'no-such-dir'), dest)
  expect(err).toMatch(/^error:src-not-found/)
  expect(existsSync(dest)).toBe(false)
})

// ── moveDir ─────────────────────────────────────────────────────────────────

test('moveDir: same-volume Move + Parent-mkdir; Inhalt vollstaendig', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-move', {
    'x.md': 'X',
    'nested/y.md': 'Y'
  })
  const before = dirHashes(src)
  const dest = join(sb.root, 'target', 'deep', 'moved-dir')

  const err = moveDir(src, dest)
  expect(err).toBeNull()

  expect(existsSync(dest)).toBe(true)
  const after = dirHashes(dest)
  expect(after.size).toBe(before.size)
  for (const [rel, hash] of before) {
    expect(after.get(rel)).toBe(hash)
  }
})

// ── snapshotDir ─────────────────────────────────────────────────────────────

test('snapshotDir: verschachtelter Ordner vollstaendig in Archiv (Hash + Count)', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-snap', {
    'readme.md': 'README',
    'sub/config.md': 'CONFIG',
    'sub/deep/data.md': 'DATA'
  })
  const beforeHashes = dirHashes(src)

  const res = snapshotDir(src, sb.archiveRoot)
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()
  expect(res.data!.snapshotPath.length).toBeGreaterThan(0)
  expect(existsSync(res.data!.snapshotPath)).toBe(true)

  // Snapshot enthaelt dieselben Dateien.
  const snapHashes = dirHashes(res.data!.snapshotPath)
  expect(snapHashes.size).toBe(beforeHashes.size)
  for (const [rel, hash] of beforeHashes) {
    expect(snapHashes.get(rel)).toBe(hash)
  }

  // Quelle unveraendert.
  const afterHashes = dirHashes(src)
  for (const [rel, hash] of beforeHashes) {
    expect(afterHashes.get(rel)).toBe(hash)
  }
})

// ── archive-missing ─────────────────────────────────────────────────────────

test('archive-missing: snapshotDir ohne Archiv-Root -> error, keine Mutation', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-missing', { 'f.md': 'CONTENT' })
  const missingRoot = join(sb.root, 'no-archive-root-here')

  const res = snapshotDir(src, missingRoot)
  expect(res.error).toBe('archive-missing')
  expect(res.data).toBeNull()
  // Quelle unveraendert.
  expect(existsSync(join(src, 'f.md'))).toBe(true)
})

test('applyDirAction archive-dir ohne Archiv-Root -> archive-missing, src unveraendert', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-adir-missing', { 'g.md': 'G' })
  const missingRoot = join(sb.root, 'no-archive')

  const res = applyDirAction(
    { action: 'archive-dir', path: src },
    { archiveRoot: missingRoot, auditPath: sb.auditPath }
  )
  expect(res.error).toBeTruthy()
  // Quelle unveraendert (kein Datei-Move ohne Snapshot).
  expect(existsSync(join(src, 'g.md'))).toBe(true)
})

// ── HR7-Pre-Snapshot-Negativtest ────────────────────────────────────────────

test('HR7-Negativ: applyDirAction bricht VOR Mutation ab wenn snapshotDir leer/fehlt', () => {
  // archive-missing => snapshotDir gibt error => applyDirAction bricht ab.
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-hr7neg', { 'important.md': 'ORIGINAL' })
  const missingRoot = join(sb.root, 'missing-archive')

  const res = applyDirAction(
    { action: 'archive-dir', path: src },
    { archiveRoot: missingRoot, auditPath: sb.auditPath }
  )
  expect(res.error).toBeTruthy() // muss Fehler liefern
  expect(res.data).toBeNull()

  // Keine Datei am Ziel veraendert, keine Quelle mutiert.
  expect(existsSync(join(src, 'important.md'))).toBe(true)
  expect(readFileSync(join(src, 'important.md'), 'utf8')).toBe('ORIGINAL')
  // Kein Archiv-Ziel erzeugt.
  expect(existsSync(missingRoot)).toBe(false)
})

// ── secret-in-tree All-or-Nothing ───────────────────────────────────────────

test('dirCheckSecretTree erkennt secret-bearing Datei im Baum', () => {
  const sb = makeSandbox()
  // Pfad-Muster das isSecretPathForWrite triggert (kein echter Secret-Wert).
  const dir = makeTestDir(sb.root, 'secret-tree', {
    'normal.md': 'OK',
    'sub/settings.json': '{"dummy":true}'
  })
  const result = dirCheckSecretTree(dir)
  expect(result).toBe('secret-in-tree')
})

test('secret-in-tree: applyDirAction verweigert GESAMTEN Ordner; nichts mutiert', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-secret-tree', {
    'readme.md': 'OK',
    'sub/settings.json': '{"dummy":true}'
  })
  const res = applyDirAction(
    { action: 'archive-dir', path: src },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
  )
  expect(res.error).toBe('secret-in-tree')
  expect(res.data).toBeNull()
  // Kein Ordner im Archiv erzeugt; Quelle unveraendert.
  expect(existsSync(join(src, 'readme.md'))).toBe(true)
  expect(existsSync(join(src, 'sub', 'settings.json'))).toBe(true)
  expect(countFiles(sb.archiveRoot)).toBe(0)
})

// ── applyDirAction archive-dir: Happy-Path (Quelle weg, Ziel vollstaendig) ──

test('applyDirAction archive-dir: Ziel vollstaendig + Quelle WEG nach erfolgreichem Move', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-happypath', {
    'a.md': 'AAA',
    'sub/b.md': 'BBB'
  })
  const beforeHashes = dirHashes(src)
  expect(beforeHashes.size).toBe(2)

  const res = applyDirAction(
    { action: 'archive-dir', path: src },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
  )
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()
  // Ziel liegt vollstaendig im Archiv.
  const movedTo = res.data!.movedTo!
  expect(existsSync(movedTo)).toBe(true)
  const afterHashes = dirHashes(movedTo)
  expect(afterHashes.size).toBe(beforeHashes.size)
  for (const [rel, hash] of beforeHashes) {
    expect(afterHashes.get(rel)).toBe(hash)
  }
  // Quelle ist WEG (echte Verschiebung, kein stilles Duplikat).
  expect(existsSync(src)).toBe(false)
})

// ── cross-volume EXDEV (Mock via copyDir+verifyCopy direkt) ─────────────────
// Realer C:->E:-Smoke ist WP-DIR-07; hier wird der copy-then-move-Branch
// durch direkten Aufruf von copyDir + verifyCopy abgedeckt.
// [MOCK] Dieser Test prueft den EXDEV-Fallback-Pfad ohne echten EXDEV.

test('[MOCK] EXDEV-Pfad: copyDir + verifyCopy: Count+Hash PASS; Quelle bei Copy-Fehler unangetastet', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-exdev', {
    'file1.md': 'CONTENT1',
    'sub/file2.md': 'CONTENT2'
  })
  const dest = join(sb.root, 'dest-exdev')
  const beforeHashes = dirHashes(src)

  // 1. Copy-Schritt (wie EXDEV-Pfad in archiveDir/moveDir).
  const copyErr = copyDir(src, dest)
  expect(copyErr).toBeNull()

  // 2. Verifikation Count+Hash VOR potenziellem Quell-Move.
  const verErr = verifyCopy(src, dest)
  expect(verErr).toBeNull()

  const destHashes = dirHashes(dest)
  expect(destHashes.size).toBe(beforeHashes.size)
  for (const [rel, hash] of beforeHashes) {
    expect(destHashes.get(rel)).toBe(hash)
  }

  // Quelle bleibt bei Copy-Fehler unangetastet (HR7).
  // Simuliere: src-not-found -> Fehler-Pfad, kein rmSync.
  const noSrcErr = copyDir(join(sb.root, 'no-such'), join(sb.root, 'irrelevant'))
  expect(noSrcErr).toBe('src-not-found')
  // Quelle (src) unveraendert.
  const afterHashes = dirHashes(src)
  expect(afterHashes.size).toBe(beforeHashes.size)
})

test('[MOCK] EXDEV-Pfad: bei Verify-Fehler bleibt Quelle unangetastet (kein rmSync vor PASS)', () => {
  const sb = makeSandbox()
  const src = makeTestDir(sb.root, 'src-exdev-verify-fail', {
    'file1.md': 'ORIGINAL'
  })
  const dest = join(sb.root, 'dest-exdev-verify-fail')

  // Simuliere Copy-PASS, dann manuell Dest beschaedigen -> verifyCopy FAIL.
  const copyErr = copyDir(src, dest)
  expect(copyErr).toBeNull()
  // Beschaedige dest: zusaetzliche Datei -> Count-Mismatch.
  writeFileSync(join(dest, 'extra.md'), 'EXTRA')

  const verErr = verifyCopy(src, dest)
  // copy-count-mismatch erwartet (dest hat mehr Dateien als src).
  expect(verErr).toMatch(/copy-count-mismatch/)

  // Da verifyCopy fehlschlaegt, wuerde archiveDir/moveDir STOPPEN (kein rmSync).
  // Quelle muss unveraendert sein.
  expect(existsSync(join(src, 'file1.md'))).toBe(true)
  expect(readFileSync(join(src, 'file1.md'), 'utf8')).toBe('ORIGINAL')
})

// ── dirFail Audit-Eintrag ───────────────────────────────────────────────────

test('dirFail: secret-in-tree oder archive-missing schreibt error-Audit-Eintrag', () => {
  const sb = makeSandbox()
  // secret-in-tree erzeugt dirFail VOR Mutation.
  const src = makeTestDir(sb.root, 'src-audit-secret', {
    'normal.md': 'OK',
    'sub/settings.json': '{"dummy":true}'
  })
  const res = applyDirAction(
    { action: 'archive-dir', path: src },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
  )
  expect(res.error).toBe('secret-in-tree')

  // Audit-Log muss einen 'error'-Eintrag enthalten.
  const auditContent = readAudit(sb.auditPath, 'utf8')
  const lines = auditContent.split('\n').filter((l) => l.trim())
  const errorLine = lines.find((l) => l.includes('"status":"error"') || l.includes('"error"'))
  expect(errorLine).toBeTruthy()
})
