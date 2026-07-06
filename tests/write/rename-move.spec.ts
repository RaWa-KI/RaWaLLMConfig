// rename-move.spec.ts — Unit-/Integrationstests fuer WP-03 (rename/move).
// ALLE Tests laufen NUR gegen temp-Sandbox (os.tmpdir via fixtures.makeSandbox),
// NIE gegen echte Config-Roots. renameEntry/moveEntryVersioned bilden intern auf
// den apply-Dispatch ab (Secret-/Scope-Gate + backup-first laufen dort), darum
// pruefen die Tests Verhalten ueber die echten Routen, nicht ueber Doubles.
import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { renameEntry, moveEntryVersioned } from '../../src/main/services/rename-move'
import { makeSandbox, seedFile, assertNotRealHome } from './fixtures'
import type { Sandbox } from './fixtures'
import type { RenameSidePath } from '@shared/contract-write-rename'

// ctx fuer rename/move: immer Sandbox-Pfade (nie real). allowedRoots optional
// (nur fuer Scope-Tests gesetzt; ohne Roots wird der Scope-Check uebersprungen).
function ctx(sb: Sandbox, allowedRoots?: string[]): { archiveRoot: string; auditPath: string; allowedRoots?: string[] } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots }
}

// Seite (RenameSidePath) aus einer frisch geseedeten Sandbox-Datei.
function side(s: 'shared' | 'claude', path: string): RenameSidePath {
  return { side: s, path }
}

// Seed einer Datei in einem EIGENEN Seiten-Unterordner der Sandbox (modelliert
// shared/claude unter verschiedenen Roots: gleicher newName kollidiert nie).
function seedSide(sb: Sandbox, sub: string, name: string, content: string): string {
  const dir = join(sb.configDir, sub)
  mkdirSync(dir, { recursive: true })
  const p = join(dir, name)
  assertNotRealHome(p)
  writeFileSync(p, content, 'utf8')
  return p
}

// ── rename: beide Seiten ─────────────────────────────────────────────────────

test('rename beide Seiten: beide Dateien umbenannt, kein partial', () => {
  const sb = makeSandbox()
  // Beide Seiten in eigenen Roots (shared/claude) — gleicher newName kollidiert nie.
  const sharedFrom = seedSide(sb, 'shared-root', 'alt.md', 'S')
  const claudeFrom = seedSide(sb, 'claude-root', 'alt.md', 'C')
  const res = renameEntry(
    { sides: 'beide', newName: 'neu.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(false)
  expect(res.data!.sides).toHaveLength(2)
  expect(res.data!.sides.every((r) => r.status === 'renamed')).toBe(true)
  // Quellen weg, neue Namen da (im jeweils EIGENEN Seiten-Verzeichnis).
  expect(existsSync(sharedFrom)).toBe(false)
  expect(existsSync(claudeFrom)).toBe(false)
  expect(readFileSync(join(dirname(sharedFrom), 'neu.md'), 'utf8')).toBe('S')
  expect(readFileSync(join(dirname(claudeFrom), 'neu.md'), 'utf8')).toBe('C')
})

// ── rename: einseitig (shared / claude) ──────────────────────────────────────

test('rename einseitig shared: nur Shared-Seite umbenannt; Claude unangetastet', () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'a-shared.md', 'S')
  const claudeFrom = seedFile(sb, 'a-claude.md', 'C')
  const res = renameEntry(
    { sides: 'shared', newName: 'umbenannt.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(false)
  expect(res.data!.sides).toHaveLength(1)
  expect(res.data!.sides[0]).toMatchObject({ side: 'shared', status: 'renamed' })
  expect(existsSync(sharedFrom)).toBe(false)
  expect(existsSync(join(dirname(sharedFrom), 'umbenannt.md'))).toBe(true)
  // Claude-Seite NICHT angefasst.
  expect(existsSync(claudeFrom)).toBe(true)
})

test('rename einseitig claude: nur Claude-Seite umbenannt; Shared unangetastet', () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'b-shared.md', 'S')
  const claudeFrom = seedFile(sb, 'b-claude.md', 'C')
  const res = renameEntry(
    { sides: 'claude', newName: 'cl-neu.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(false)
  expect(res.data!.sides).toHaveLength(1)
  expect(res.data!.sides[0]).toMatchObject({ side: 'claude', status: 'renamed' })
  expect(existsSync(claudeFrom)).toBe(false)
  expect(existsSync(join(dirname(claudeFrom), 'cl-neu.md'))).toBe(true)
  expect(existsSync(sharedFrom)).toBe(true)
})

// ── rename: Teilfehler -> partial-Report ─────────────────────────────────────

test('rename beide: eine Seite fehlt physisch -> partial mit einem error', () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'real-shared.md', 'S')
  // Claude-Quelle existiert NICHT -> apply-move wirft NOT_FOUND -> status 'error'.
  const claudeMissing = join(sb.configDir, 'gibt-es-nicht.md')
  assertNotRealHome(claudeMissing)
  const res = renameEntry(
    { sides: 'beide', newName: 'p.md', shared: side('shared', sharedFrom), claude: side('claude', claudeMissing) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(true)
  const sharedRes = res.data!.sides.find((r) => r.side === 'shared')!
  const claudeRes = res.data!.sides.find((r) => r.side === 'claude')!
  expect(sharedRes.status).toBe('renamed')
  expect(claudeRes.status).toBe('error')
  expect(claudeRes.toPath).toBeNull()
  // Erfolgreiche Seite wurde dennoch umbenannt (kein All-or-Nothing bei rename).
  expect(existsSync(join(dirname(sharedFrom), 'p.md'))).toBe(true)
})

// ── rename: secret-skip ──────────────────────────────────────────────────────

test('rename secret-skip: secret-bearing Quelle wird NICHT umbenannt', () => {
  const sb = makeSandbox()
  // auth.json ist secret-bearing (secret-guard SSOT) -> secret-skip, kein Move.
  const secretFrom = seedFile(sb, 'auth.json', '{"dummy":true}')
  const res = renameEntry(
    { sides: 'shared', newName: 'auth-neu.json', shared: side('shared', secretFrom) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(true)
  expect(res.data!.sides[0].status).toBe('secret-skip')
  expect(res.data!.sides[0].toPath).toBeNull()
  // Quelle unangetastet (kein Rename trotz secret-skip).
  expect(existsSync(secretFrom)).toBe(true)
})

// ── rename: out-of-scope-Ablehnung ───────────────────────────────────────────

test('rename out-of-scope: Quelle ausserhalb allowedRoots -> out-of-scope, kein Move', () => {
  const sb = makeSandbox()
  // Datei liegt in der Sandbox, aber allowedRoots zeigt auf einen ANDEREN Ordner.
  const from = seedFile(sb, 'scoped.md', 'X')
  const otherRoot = join(sb.root, 'erlaubt-aber-leer')
  const res = renameEntry(
    { sides: 'shared', newName: 'scoped-neu.md', shared: side('shared', from) },
    ctx(sb, [otherRoot])
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(true)
  expect(res.data!.sides[0].status).toBe('out-of-scope')
  expect(existsSync(from)).toBe(true)
  expect(existsSync(join(dirname(from), 'scoped-neu.md'))).toBe(false)
})

// ── rename: secret -> nonsecret (Ablehnung) ──────────────────────────────────

test('rename secret->nonsecret: secret-Quelle wird trotz nonsecret-Zielname abgelehnt', () => {
  const sb = makeSandbox()
  // Quell-Basename secret (auth.json), Ziel-Basename nonsecret (notiz.md).
  const secretFrom = seedFile(sb, 'auth.json', '{"dummy":true}')
  const res = renameEntry(
    { sides: 'shared', newName: 'notiz.md', shared: side('shared', secretFrom) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(true)
  expect(res.data!.sides[0].status).toBe('secret-skip')
  // Quelle bleibt secret + unangetastet (Gate prueft Quell-Basename).
  expect(existsSync(secretFrom)).toBe(true)
  expect(basename(secretFrom)).toBe('auth.json')
})

// ── rename: nonsecret -> secret (Ablehnung) ──────────────────────────────────

test('rename nonsecret->secret: Ziel-Name waere secret-bearing -> abgelehnt, Quelle bleibt', () => {
  const sb = makeSandbox()
  // Quell-Basename nonsecret (harmlos.md), Ziel-Basename secret (.env triggert
  // SECRET_SUFFIX_RX) -> Ziel-Gate verweigert -> secret-skip, kein Move.
  const from = seedFile(sb, 'harmlos.md', 'OK')
  const res = renameEntry(
    { sides: 'claude', newName: '.env', claude: side('claude', from) },
    ctx(sb)
  )
  expect(res.error).toBeNull()
  expect(res.data!.partial).toBe(true)
  expect(res.data!.sides[0].status).toBe('secret-skip')
  // Quelle unveraendert, kein secret-bearendes Ziel angelegt.
  expect(existsSync(from)).toBe(true)
  expect(existsSync(join(dirname(from), '.env'))).toBe(false)
})

// ── move: Cross-Root-Move (Datei) beidseitig pruefbar ────────────────────────

test('moveEntryVersioned shared: Datei an freien Zielpfad verschoben (backup-first)', () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-shared.md', 'SHARED')
  const to = join(sb.configDir, 'ziel-shared', 'mv-shared.md')
  assertNotRealHome(to)
  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to }, ctx(sb, [sb.configDir]))
  expect(res.error).toBeNull()
  expect(res.data!.version).toBe('shared')
  expect(res.data!.isDir).toBe(false)
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('SHARED')
  // backup-first: Pre-Snapshot der Quelle vorhanden.
  expect(res.data!.backupPath).toBeTruthy()
  expect(existsSync(res.data!.backupPath!)).toBe(true)
})

test('moveEntryVersioned claude: zweite Version derselben Route verschiebt korrekt', () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-claude.md', 'CLAUDE')
  const to = join(sb.configDir, 'ziel-claude', 'mv-claude.md')
  assertNotRealHome(to)
  const res = moveEntryVersioned({ version: 'claude', fromPath: from, to }, ctx(sb, [sb.configDir]))
  expect(res.error).toBeNull()
  expect(res.data!.version).toBe('claude')
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('CLAUDE')
})

// ── move: Owner-frei gewaehltes Ziel ausserhalb der Wurzeln ist ERLAUBT (Finding A) ─

test('moveEntryVersioned: Ziel ausserhalb allowedRoots ist erlaubt (owner-frei), backup-first', () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-scope.md', 'X')
  // Ziel ausserhalb allowedRoots -> Finding A: owner-initiierter Move erlaubt JEDES
  // absolute Ziel. Quelle ist in-scope/non-secret -> Move laeuft durch.
  const to = join(sb.root, 'ausserhalb', 'mv-scope.md')
  assertNotRealHome(to)
  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to }, ctx(sb, [sb.configDir]))
  expect(res.error).toBeNull()
  expect(res.data!.movedTo).toBe(to)
  // Quelle verschoben, Ziel angelegt, Inhalt erhalten.
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('X')
  // backup-first: Pre-Snapshot der Quelle vorhanden.
  expect(res.data!.backupPath).toBeTruthy()
  expect(existsSync(res.data!.backupPath!)).toBe(true)
})

test('moveEntryVersioned: relatives Ziel -> MOVE_TARGET_NOT_ABSOLUTE, Quelle bleibt', () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-rel.md', 'X')
  // Relatives Ziel wuerde gegen das CWD des Main-Prozesses aufgeloest -> falsches/
  // unvorhersehbares Ziel (Move-Datenverlust). Versions-Move laeuft owner-frei
  // (ownerMove=true) -> Ziel-Allowlist umgangen, daher ist der Absolut-Check der
  // load-bearing Guard. doMove lehnt VOR jeder Mutation ab.
  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to: 'rel-ziel.md' }, ctx(sb, [sb.configDir]))
  expect(res.data).toBeNull()
  expect(res.error).toBe('MOVE_TARGET_NOT_ABSOLUTE')
  // Quelle unangetastet, kein Ziel angelegt.
  expect(existsSync(from)).toBe(true)
  expect(existsSync(join(dirname(from), 'rel-ziel.md'))).toBe(false)
})

test('moveEntryVersioned: secret-Quelle bleibt geblockt, auch bei owner-freiem Ziel', () => {
  const sb = makeSandbox()
  // auth.json ist secret-bearing (Quell-Gate) -> Move verweigert, egal welches Ziel.
  const from = seedFile(sb, 'auth.json', '{"dummy":true}')
  const to = join(sb.root, 'ausserhalb', 'auth.json')
  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to }, ctx(sb, [sb.configDir]))
  expect(res.data).toBeNull()
  expect(res.error).toBeTruthy()
  // Secret-Quelle unangetastet, kein Ziel angelegt.
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)
})

// ── invalid-request-Robustheit (kein throw nach aussen) ──────────────────────

test('rename invalid: Name mit Pfad-Segment wird abgelehnt (kein throw)', () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'inv.md', 'X')
  const res = renameEntry(
    { sides: 'shared', newName: 'sub/neu.md', shared: side('shared', from) },
    ctx(sb)
  )
  expect(res.data).toBeNull()
  expect(res.error).toBeTruthy()
  expect(existsSync(from)).toBe(true)
})
