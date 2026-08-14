// drift-relation.spec.ts — Drift-Erkennung als NEUE Gruppierung ueber die
// userglobal-Kategorien (Plan 2026-07-20, WP3). Cross-Scope-Kopien (gleiche
// normalizeCat-Achse + gleicher normalizeKey-Name in >= 2 Loader-Roots claude/
// codex/agents) werden DriftRelation mit suggestion 'parity' und Hash-Status.
// ALLE Pfade liegen in einer temp-Sandbox (NIE reale Config); Inhalte Dummy.
import { test, expect } from '@playwright/test'
import { appendFileSync, statSync } from 'node:fs'
import { findDriftRelations } from '../../src/main/services/drift-relation'
import { createDriftRelationStore } from '../../src/main/services/drift-relation-store'
import { hashFile, MAX_HASH_BYTES } from '../../src/main/services/dedupe-fs'
import { driftRelationKey } from '../../shared/contract-drift'
import { makeSandbox, seedFile } from './fixtures'
import type { Sandbox } from './fixtures'
import type { ConfigEntry, Category, LlmConfig } from '../../shared/contract'

function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-07-20' }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

function mkData(categories: Category[]): Record<string, LlmConfig> {
  return { userglobal: { categories, duplicates: [] } }
}

function relations(data: Record<string, LlmConfig>) {
  return data.userglobal.driftRelations ?? []
}

function mkStore(sb: Sandbox) {
  return createDriftRelationStore({
    storePath: `${sb.configDir}/drift-decisions.json`,
    archiveRoot: sb.archiveRoot,
    auditPath: sb.auditPath,
  })
}

test('(a) gleicher Skill in claude+codex mit gleichem Inhalt -> 1 Relation, status same', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'claude-foo-skill.md', 'IDENTISCH\n')
  const codexPath = seedFile(sb, 'codex-foo-skill.md', 'IDENTISCH\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('userglobal-claude-skill-foo', 'foo', claudePath)]),
    mkCat('userglobal-codex-skills', [mkEntry('userglobal-codex-skill-foo', 'foo', codexPath)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(1)
  const rel = relations(data)[0]
  expect(rel.status).toBe('same')
  expect(rel.suggestion).toBe('parity')
  expect(rel.decision).toBeUndefined()
  expect(rel.members.map((m) => m.rootKind).sort()).toEqual(['claude', 'codex'])
  expect(rel.members.every((m) => typeof m.sha256 === 'string' && m.sha256.length === 64)).toBe(true)
})

test('(b) abweichender Inhalt -> status diff', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'claude-foo.md', 'ALT\n')
  const codexPath = seedFile(sb, 'codex-foo.md', 'NEU\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', claudePath)]),
    mkCat('userglobal-codex-skills', [mkEntry('x-foo', 'foo', codexPath)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(1)
  expect(relations(data)[0].status).toBe('diff')
})

test('(c) 3er-Gruppe claude+codex+agents -> 1 Relation mit 3 members', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'c-foo.md', 'DREI\n')
  const codexPath = seedFile(sb, 'x-foo.md', 'DREI\n')
  const agentsPath = seedFile(sb, 'a-foo.md', 'DREI\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', claudePath)]),
    mkCat('userglobal-codex-skills', [mkEntry('x-foo', 'foo', codexPath)]),
    mkCat('userglobal-agents-skills', [mkEntry('a-foo', 'foo', agentsPath)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(1)
  expect(relations(data)[0].members.map((m) => m.rootKind).sort()).toEqual(['agents', 'claude', 'codex'])
})

test('(d) nur ein Root hat den Skill -> KEINE Relation', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'c-solo.md', 'SOLO\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-solo', 'solo', claudePath)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(0)
})

test('(e) zwei verschiedene Skills gemischt -> keine Fehlgruppierung', () => {
  const sb = makeSandbox()
  const cFoo = seedFile(sb, 'c-foo.md', 'F\n')
  const xFoo = seedFile(sb, 'x-foo.md', 'F\n')
  const cBar = seedFile(sb, 'c-bar.md', 'B\n')
  const xBar = seedFile(sb, 'x-bar.md', 'B\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', cFoo), mkEntry('c-bar', 'bar', cBar)]),
    mkCat('userglobal-codex-skills', [mkEntry('x-foo', 'foo', xFoo), mkEntry('x-bar', 'bar', xBar)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(2)
  for (const rel of relations(data)) {
    expect(rel.members).toHaveLength(2)
    // Jede Relation enthaelt nur Mitglieder mit demselben Namen.
    const names = new Set(rel.members.map((m) => m.path))
    expect(names.size).toBe(2)
    expect(rel.members.some((m) => m.path.includes(rel.name))).toBe(true)
  }
})

test('(f) persistierte Decision wird auf die Relation angewendet (Key ueber driftRelationKey)', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'c-foo.md', 'X\n')
  const codexPath = seedFile(sb, 'x-foo.md', 'X\n')
  const store = mkStore(sb)
  const key = driftRelationKey('userglobal-claude-skills', 'foo', ['claude', 'codex'])
  const written = store.writeDecision(key, 'ignored')
  expect(written.ok).toBe(true)
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', claudePath)]),
    mkCat('userglobal-codex-skills', [mkEntry('x-foo', 'foo', codexPath)]),
  ])
  findDriftRelations(data, store)
  expect(relations(data)).toHaveLength(1)
  expect(relations(data)[0].decision).toBe('ignored')
  expect(typeof relations(data)[0].decidedAt).toBe('string')
})

test('unbekannte Store-Keys bleiben harmlos (keine Relation, kein Fehler)', () => {
  const sb = makeSandbox()
  const store = mkStore(sb)
  store.writeDecision(driftRelationKey('skills', 'gibts-nicht', ['claude', 'codex']), 'parity')
  const claudePath = seedFile(sb, 'c-foo.md', 'X\n')
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-foo', 'foo', claudePath)]),
  ])
  findDriftRelations(data, store)
  expect(relations(data)).toHaveLength(0)
})

test('nicht-userglobal-Kategorien werden ignoriert (shared-/nackte Achsen)', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'c-foo.md', 'X\n')
  const sharedPath = seedFile(sb, 's-foo.md', 'X\n')
  const data: Record<string, LlmConfig> = {
    claude: { categories: [mkCat('skills', [mkEntry('c-foo', 'foo', claudePath)])], duplicates: [] },
    shared: { categories: [mkCat('shared-skills', [mkEntry('s-foo', 'foo', sharedPath)])], duplicates: [] },
    userglobal: { categories: [], duplicates: [] },
  }
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(0)
})

// Security 2026-08-14 (unbounded drift hashing): hashFile hat einen Size-Guard.
// Riesige gleichnamige Dateien in zwei Provider-Roots duerfen den Main-Prozess
// nicht mehr blockieren — Oversize gilt als nicht vergleichbar (sha256 fehlt,
// Status 'diff'), statt synchron eine unbegrenzte Datei zu lesen.
test('Size-Guard: Datei ueber MAX_HASH_BYTES wird nicht gehasht', () => {
  const sb = makeSandbox()
  const big = seedFile(sb, 'big.md', 'KOPF\n')
  appendFileSync(big, Buffer.alloc(MAX_HASH_BYTES + 1, 65))
  expect(statSync(big).size).toBeGreaterThan(MAX_HASH_BYTES)
  expect(hashFile(big)).toBeNull()
  const small = seedFile(sb, 'small.md', 'klein\n')
  expect(typeof hashFile(small)).toBe('string')
})

test('Size-Guard: Oversize-Mitglieder liefern sha256 undefined und status diff', () => {
  const sb = makeSandbox()
  const claudePath = seedFile(sb, 'claude-big.md', 'KOPF\n')
  const codexPath = seedFile(sb, 'codex-big.md', 'KOPF\n')
  appendFileSync(claudePath, Buffer.alloc(MAX_HASH_BYTES + 1, 66))
  appendFileSync(codexPath, Buffer.alloc(MAX_HASH_BYTES + 1, 66))
  const data = mkData([
    mkCat('userglobal-claude-skills', [mkEntry('c-big', 'big', claudePath)]),
    mkCat('userglobal-codex-skills', [mkEntry('x-big', 'big', codexPath)]),
  ])
  findDriftRelations(data, mkStore(sb))
  expect(relations(data)).toHaveLength(1)
  const rel = relations(data)[0]
  expect(rel.status).toBe('diff')
  expect(rel.members.every((m) => m.sha256 === undefined)).toBe(true)
})
