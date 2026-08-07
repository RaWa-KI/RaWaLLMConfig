// rename-move.spec.ts — Unit-/Integrationstests fuer WP-03 (rename/move).
// ALLE Tests laufen NUR gegen temp-Sandbox (os.tmpdir via fixtures.makeSandbox),
// NIE gegen echte Config-Roots. Alle Mutationen laufen ueber den aktiven
// Integrity-Preview-/Apply-Kanal (Secret-/Scope-Gate + backup-first).
import { test, expect } from '@playwright/test'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { makeSandbox, seedFile, assertNotRealHome } from './fixtures'
import type { Sandbox } from './fixtures'
import type { RenameSidePath } from '@shared/contract-write-rename'
import { previewAndApply } from './integrity-helpers'

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

test('rename beide Seiten: beide Dateien umbenannt, kein partial', async () => {
  const sb = makeSandbox()
  // Beide Seiten in eigenen Roots (shared/claude) — gleicher newName kollidiert nie.
  const sharedFrom = seedSide(sb, 'shared-root', 'alt.md', 'S')
  const claudeFrom = seedSide(sb, 'claude-root', 'alt.md', 'C')
  const run = await previewAndApply(
    {
      kind: 'rename',
      req: { sides: 'beide', newName: 'neu.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) }
    },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.preview.data?.fsOps).toHaveLength(2)
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(run.apply?.data?.partial).toBe(false)
  // Quellen weg, neue Namen da (im jeweils EIGENEN Seiten-Verzeichnis).
  expect(existsSync(sharedFrom)).toBe(false)
  expect(existsSync(claudeFrom)).toBe(false)
  expect(readFileSync(join(dirname(sharedFrom), 'neu.md'), 'utf8')).toBe('S')
  expect(readFileSync(join(dirname(claudeFrom), 'neu.md'), 'utf8')).toBe('C')
})

// ── rename: einseitig (shared / claude) ──────────────────────────────────────

test('rename einseitig shared: nur Shared-Seite umbenannt; Claude unangetastet', async () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'a-shared.md', 'S')
  const claudeFrom = seedFile(sb, 'a-claude.md', 'C')
  const run = await previewAndApply(
    {
      kind: 'rename',
      req: { sides: 'shared', newName: 'umbenannt.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) }
    },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.preview.data?.fsOps).toHaveLength(1)
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(existsSync(sharedFrom)).toBe(false)
  expect(existsSync(join(dirname(sharedFrom), 'umbenannt.md'))).toBe(true)
  // Claude-Seite NICHT angefasst.
  expect(existsSync(claudeFrom)).toBe(true)
})

test('rename einseitig claude: nur Claude-Seite umbenannt; Shared unangetastet', async () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'b-shared.md', 'S')
  const claudeFrom = seedFile(sb, 'b-claude.md', 'C')
  const run = await previewAndApply(
    {
      kind: 'rename',
      req: { sides: 'claude', newName: 'cl-neu.md', shared: side('shared', sharedFrom), claude: side('claude', claudeFrom) }
    },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.preview.data?.fsOps).toHaveLength(1)
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(existsSync(claudeFrom)).toBe(false)
  expect(existsSync(join(dirname(claudeFrom), 'cl-neu.md'))).toBe(true)
  expect(existsSync(sharedFrom)).toBe(true)
})

// ── rename: Teilfehler -> partial-Report ─────────────────────────────────────

test('rename beide: eine Seite fehlt physisch -> atomarer Rollback', async () => {
  const sb = makeSandbox()
  const sharedFrom = seedFile(sb, 'real-shared.md', 'S')
  // Claude-Quelle existiert NICHT -> Integrity-Apply rollt den Batch zurück.
  const claudeMissing = join(sb.configDir, 'gibt-es-nicht.md')
  assertNotRealHome(claudeMissing)
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'beide', newName: 'p.md', shared: side('shared', sharedFrom), claude: side('claude', claudeMissing) } },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.preview.data?.fsOps).toHaveLength(2)
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.partial).toBe(false)
  expect(run.apply?.data?.rolledBack).toBe(true)
  expect(run.apply?.data?.rollbackStatus).toBe('rolled-back')
  expect(existsSync(sharedFrom)).toBe(true)
  expect(existsSync(join(dirname(sharedFrom), 'p.md'))).toBe(false)
})

// ── rename: secret-skip ──────────────────────────────────────────────────────

test('rename secret-skip: secret-bearing Quelle wird NICHT umbenannt', async () => {
  const sb = makeSandbox()
  // auth.json ist secret-bearing (secret-guard SSOT) -> secret-skip, kein Move.
  const secretFrom = seedFile(sb, 'auth.json', '{"dummy":true}')
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'shared', newName: 'auth-neu.json', shared: side('shared', secretFrom) } },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.rolledBack).toBe(true)
  // Quelle unangetastet (kein Rename trotz secret-skip).
  expect(existsSync(secretFrom)).toBe(true)
})

// ── rename: out-of-scope-Ablehnung ───────────────────────────────────────────

test('rename out-of-scope: Quelle ausserhalb allowedRoots -> out-of-scope, kein Move', async () => {
  const sb = makeSandbox()
  // Datei liegt in der Sandbox, aber allowedRoots zeigt auf einen ANDEREN Ordner.
  const from = seedFile(sb, 'scoped.md', 'X')
  const otherRoot = join(sb.root, 'erlaubt-aber-leer')
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'shared', newName: 'scoped-neu.md', shared: side('shared', from) } },
    ctx(sb, [otherRoot])
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.data).toBeNull()
  expect(run.apply?.error).toBe('out-of-scope')
  expect(existsSync(from)).toBe(true)
  expect(existsSync(join(dirname(from), 'scoped-neu.md'))).toBe(false)
})

// ── rename: secret -> nonsecret (Ablehnung) ──────────────────────────────────

test('rename secret->nonsecret: secret-Quelle wird trotz nonsecret-Zielname abgelehnt', async () => {
  const sb = makeSandbox()
  // Quell-Basename secret (auth.json), Ziel-Basename nonsecret (notiz.md).
  const secretFrom = seedFile(sb, 'auth.json', '{"dummy":true}')
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'shared', newName: 'notiz.md', shared: side('shared', secretFrom) } },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.rolledBack).toBe(true)
  // Quelle bleibt secret + unangetastet (Gate prueft Quell-Basename).
  expect(existsSync(secretFrom)).toBe(true)
  expect(basename(secretFrom)).toBe('auth.json')
})

// ── rename: nonsecret -> secret (Ablehnung) ──────────────────────────────────

test('rename nonsecret->secret: Ziel-Name waere secret-bearing -> abgelehnt, Quelle bleibt', async () => {
  const sb = makeSandbox()
  // Quell-Basename nonsecret (harmlos.md), Ziel-Basename secret (.env triggert
  // SECRET_SUFFIX_RX) -> Ziel-Gate verweigert -> secret-skip, kein Move.
  const from = seedFile(sb, 'harmlos.md', 'OK')
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'claude', newName: '.env', claude: side('claude', from) } },
    ctx(sb)
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(false)
  expect(run.apply?.data?.rolledBack).toBe(true)
  // Quelle unveraendert, kein secret-bearendes Ziel angelegt.
  expect(existsSync(from)).toBe(true)
  expect(existsSync(join(dirname(from), '.env'))).toBe(false)
})

// ── move: Cross-Root-Move (Datei) beidseitig pruefbar ────────────────────────

test('Integrity move shared: Datei an freien Zielpfad verschoben (backup-first)', async () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-shared.md', 'SHARED')
  const to = join(sb.configDir, 'ziel-shared', 'mv-shared.md')
  assertNotRealHome(to)
  const run = await previewAndApply(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb, [sb.configDir])
  )
  expect(run.preview.error).toBeNull()
  expect(run.preview.data?.fsOps[0].action).toBe('move')
  expect(run.preview.data?.fsOps[0].isDir).toBe(false)
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('SHARED')
  // backup-first: Pre-Snapshot der Quelle vorhanden.
  expect(run.apply?.data?.journalPath).toBeTruthy()
  expect(existsSync(run.apply!.data!.journalPath!)).toBe(true)
  const journal = readFileSync(run.apply!.data!.journalPath!, 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line) as { phase: string; snapshotPath?: string })
  expect(journal.some((entry) => entry.phase === 'snapshot' && entry.snapshotPath && existsSync(entry.snapshotPath))).toBe(true)
})

test('Integrity move claude: zweite Version derselben Route verschiebt korrekt', async () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-claude.md', 'CLAUDE')
  const to = join(sb.configDir, 'ziel-claude', 'mv-claude.md')
  assertNotRealHome(to)
  const run = await previewAndApply(
    { kind: 'move', req: { version: 'claude', fromPath: from, to } },
    ctx(sb, [sb.configDir])
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('CLAUDE')
})

// ── move: Owner-frei gewaehltes Ziel ausserhalb der Wurzeln ist ERLAUBT (Finding A) ─

test('Integrity move: Ziel ausserhalb allowedRoots ist erlaubt (owner-frei), backup-first', async () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'mv-scope.md', 'X')
  // Ziel ausserhalb allowedRoots -> Finding A: owner-initiierter Move erlaubt JEDES
  // absolute Ziel. Quelle ist in-scope/non-secret -> Move laeuft durch.
  const to = join(sb.root, 'ausserhalb', 'mv-scope.md')
  assertNotRealHome(to)
  const run = await previewAndApply(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb, [sb.configDir])
  )
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(run.apply?.data?.movedTo).toBe(to)
  // Quelle verschoben, Ziel angelegt, Inhalt erhalten.
  expect(existsSync(from)).toBe(false)
  expect(readFileSync(to, 'utf8')).toBe('X')
  // backup-first: Pre-Snapshot der Quelle vorhanden.
  expect(run.apply?.data?.journalPath).toBeTruthy()
  expect(existsSync(run.apply!.data!.journalPath!)).toBe(true)
})

// ── invalid-request-Robustheit (kein throw nach aussen) ──────────────────────

test('rename invalid: Name mit Pfad-Segment wird abgelehnt (kein throw)', async () => {
  const sb = makeSandbox()
  const from = seedFile(sb, 'inv.md', 'X')
  const run = await previewAndApply(
    { kind: 'rename', req: { sides: 'shared', newName: 'sub/neu.md', shared: side('shared', from) } },
    ctx(sb)
  )
  expect(run.preview.data).toBeNull()
  expect(run.preview.error).toContain('newName muss reiner Basisname sein')
  expect(existsSync(from)).toBe(true)
})
