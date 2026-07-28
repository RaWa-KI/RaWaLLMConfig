// drift-relation-store.spec.ts — Store-Basis WP1 (Plan 2026-07-20):
// Roundtrip, Revidieren, backup-first, Key-Stabilitaet. Public-safe: nur
// Temp-Pfade und Kunstschluessel, keine Privatpfade/Nutzerdaten.
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createDriftRelationStore } from '../../src/main/services/drift-relation-store'
import { driftRelationKey } from '../../shared/contract-drift'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'rawallmconfig-drift-store-'))
}

function makeStore(root: string) {
  return createDriftRelationStore({
    storePath: join(root, 'drift-relation-decisions.json'),
    archiveRoot: join(root, 'archive'),
    auditPath: join(root, 'audit.jsonl'),
  })
}

test('leerer Store liefert keine Decisions', () => {
  const root = makeRoot()
  expect(makeStore(root).readDecisions()).toEqual([])
})

test('writeDecision persistiert und readDecisions liefert den Eintrag', () => {
  const root = makeRoot()
  const store = makeStore(root)
  const key = driftRelationKey('userglobal-claude-skills', 'demo-skill', ['claude', 'codex'])

  expect(store.writeDecision(key, 'parity')).toEqual({ ok: true, error: null })
  const decisions = makeStore(root).readDecisions()
  expect(decisions).toHaveLength(1)
  expect(decisions[0].key).toBe(key)
  expect(decisions[0].decision).toBe('parity')
  expect(typeof decisions[0].decidedAt).toBe('string')
})

test('Revidieren (gleicher Key, neue Decision) ueberschreibt den Eintrag', () => {
  const root = makeRoot()
  mkdirSync(join(root, 'archive'), { recursive: true })
  const store = makeStore(root)
  const key = driftRelationKey('userglobal-claude-skills', 'demo-skill', ['claude', 'codex'])

  expect(store.writeDecision(key, 'parity').ok).toBe(true)
  expect(store.writeDecision(key, 'ignored').ok).toBe(true)
  const decisions = store.readDecisions()
  expect(decisions).toHaveLength(1)
  expect(decisions[0].decision).toBe('ignored')
})

test('ungueltige Decision wird abgelehnt und schreibt nichts', () => {
  const root = makeRoot()
  const store = makeStore(root)
  // @ts-expect-error bewusst ungueltiger Wert zur Laufzeit-Validierung
  expect(store.writeDecision('skills|demo|claude', 'loeschen').ok).toBe(false)
  expect(store.readDecisions()).toEqual([])
})

test('backup-first: beim zweiten Schreiben liegt ein Pre-Snapshot im Archiv', () => {
  const root = makeRoot()
  mkdirSync(join(root, 'archive'), { recursive: true })
  const store = makeStore(root)
  const key = driftRelationKey('userglobal-claude-skills', 'demo-skill', ['claude', 'codex'])

  expect(store.writeDecision(key, 'parity').ok).toBe(true)
  expect(store.writeDecision(key, 'duplicate').ok).toBe(true)
  const backups = readdirSync(join(root, 'archive'), { recursive: true })
  expect(backups.some((entry) => String(entry).endsWith('.bak'))).toBe(true)
})

test('driftRelationKey ist sortierungsunabhaengig und nutzt normalizeCat/normalizeKey', () => {
  const a = driftRelationKey('userglobal-claude-skills', 'Demo-Skill.md', ['claude', 'codex'])
  const b = driftRelationKey('userglobal-codex-skills', 'demo-skill.toml', ['codex', 'claude'])
  expect(a).toBe(b)
  expect(a).toBe('skills|demo-skill|claude+codex')
  // Drei Roots (Kimi via ~/.agents) bilden eine eigene, ebenfalls stabile Gruppe.
  const c = driftRelationKey('userglobal-claude-skills', 'demo-skill', ['agents', 'codex', 'claude'])
  expect(c).toBe('skills|demo-skill|agents+claude+codex')
})
