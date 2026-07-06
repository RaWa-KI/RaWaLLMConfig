// rename-reference-integrity.spec.ts — Failing Specs für W3/W5 (TDD).
// Prüft: Rename schreibt Referenzen auf neuen Basename um; Batch-'beide' ist
// atomar; alter renameEntry-Kanal umgeht Integrity-Schicht nicht (W5-Gate).
// Alle Assertions schlagen mit dem STUB fehl — ROT aus dem richtigen Grund.
import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, writeText, readText } from './integrity-helpers'
import {
  previewIntegrity,
  applyIntegrity
} from '../../src/main/services/integrity/apply-integrity'
import { renameEntry } from '../../src/main/services/rename-move'

// ── Test 1: Rename schreibt Wikilinks + strukturierte Pfade auf neuen Namen ─

test('applyIntegrity(rename) schreibt Wikilinks und Pfadstrings auf neuen Basename um', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'rules', 'code-quality.md')
  const newName = 'code-quality-v2.md'
  const newPath = join(dirname(from), newName)
  writeText(from, '# Code Quality\n')

  const ref = sandboxPath(sb, 'docs', 'reference.md')
  writeText(ref, [
    'Siehe [[code-quality]] fuer die Regel.',
    `Pfad: ${slash(from)}`
  ].join('\n'))

  const preview = await previewIntegrity(
    { kind: 'rename', req: { sides: 'shared', newName, shared: { side: 'shared', path: from } } },
    ctx(sb)
  )

  // STUB → schlägt fehl
  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(true)
  expect(existsSync(newPath)).toBe(true)

  const after = readText(ref)
  expect(after).toContain('[[code-quality-v2]]')
  expect(after).not.toContain('[[code-quality]]')
  expect(after).toContain(slash(newPath))
  expect(after).not.toContain(slash(from))
})

// ── Test 2: Rename 'beide' ist eine atomare Batch-Operation ───────────────

test('applyIntegrity(rename beide) ist atomar — kein partieller Grün-Erfolg', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const shared = sandboxPath(sb, 'shared', 'rules', 'harte-regeln.md')
  const claude = sandboxPath(sb, 'userglobal', 'rules', 'harte-regeln.md')
  const newName = 'harte-regeln-v2.md'
  writeText(shared, '# Harte Regeln shared\n')
  writeText(claude, '# Harte Regeln claude\n')

  // Referenz auf beide Seiten
  const ref = sandboxPath(sb, 'docs', 'ref-beide.md')
  writeText(ref, [
    `shared: ${slash(shared)}`,
    `claude: ${slash(claude)}`
  ].join('\n'))

  // Hook der einen Fehler nach dem ersten FS-Rename auslöst
  let called = false
  const failAfterFirst = {
    beforeReferences: () => {
      if (!called) { called = true; return }
      throw new Error('simulierter Fehler nach erster Seite')
    }
  }

  const preview = await previewIntegrity(
    {
      kind: 'rename',
      req: {
        sides: 'beide',
        newName,
        shared: { side: 'shared', path: shared },
        claude: { side: 'claude', path: claude }
      }
    },
    ctx(sb, { hooks: failAfterFirst })
  )

  // STUB → schlägt fehl; nach Implementierung:
  // Entweder beide Seiten korrekt umbenannt ODER gar keine (Rollback).
  // `partial` muss false sein — nie ein partieller Grün-Erfolg.
  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks: failAfterFirst })
  )

  // Entweder erfolgreich (beide) oder rolled-back (keine):
  if (apply.data?.applied) {
    const sharedNew = join(dirname(shared), newName)
    const claudeNew = join(dirname(claude), newName)
    expect(existsSync(sharedNew)).toBe(true)
    expect(existsSync(claudeNew)).toBe(true)
    expect(apply.data.partial).toBe(false)
  } else {
    // Rollback: Quellen unverändert
    expect(apply.data?.rolledBack).toBe(true)
    expect(existsSync(shared)).toBe(true)
    expect(existsSync(claude)).toBe(true)
    expect(apply.data?.partial).toBe(false)
  }
})

// ── Test 3: alter renameEntry-Kanal darf Integrity-Schicht nicht umgehen ──
// wird grün nach W5 (renameEntry leitet auf Integrity um)

test('renameEntry hinterlässt keine alten Pflicht-Referenzstrings // wird grün nach W5', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'rules', 'agent-routing-old.md')
  const newName = 'agent-routing-renamed.md'
  const newPath = join(dirname(from), newName)

  writeText(from, '# Agent Routing Old\n')

  const ref = sandboxPath(sb, 'docs', 'surface.md')
  writeText(ref, [
    'Siehe [[agent-routing-old]] fuer Details.',
    `Pfad: ${slash(from)}`
  ].join('\n'))

  // Alter direkter renameEntry-Aufruf — sollte nach W5 die Integrity-Schicht nutzen
  const res = renameEntry(
    { sides: 'shared', newName, shared: { side: 'shared', path: from } },
    { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
  )

  // STUB-Erwartung: nach renameEntry darf kein alter Referenzstring in `ref` übrig bleiben.
  // Wird erst nach W5 grün — hier wird die Invariante formuliert.
  expect(res.error).toBeNull()
  expect(existsSync(newPath)).toBe(true)

  const after = readText(ref)
  // Diese Assertions sind nach W5 grün; aktuell möglicherweise noch rot:
  expect(after).not.toContain('[[agent-routing-old]]')
  expect(after).not.toContain(slash(from))
})
