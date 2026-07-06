// move-reference-integrity.spec.ts — Failing Specs für W3/W5 (TDD).
// Prüft: previewIntegrity + applyIntegrity liefern einen Integritäts-Plan für
// Move-Operationen und schreiben bekannte Referenzformen korrekt um.
// Alle Assertions schlagen mit dem STUB fehl ("not-implemented") — ROT aus dem
// richtigen Grund. Keine echten Pfade, keine Secrets.
import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, norm, writeText, writeDeps, readDep, readText } from './integrity-helpers'
import {
  previewIntegrity,
  applyIntegrity
} from '../../src/main/services/integrity/apply-integrity'

// ── Test 1: Plan enthält referenceOps für canonical_source + loader_path ──

test('previewIntegrity(move) liefert Plan mit referenceOps für governance-dependencies', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'token-effizienz', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'token-effizienz', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Token Effizienz\n')
  writeDeps(deps, 'token-effizienz', from)

  const result = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  // STUB liefert { data: null, error: 'not-implemented' } → schlägt fehl
  expect(result.error).toBeNull()
  expect(result.data).not.toBeNull()
  const plan = result.data!
  expect(plan.referenceOps.length).toBeGreaterThan(0)
  const op = plan.referenceOps.find(o => o.filePath === deps)
  expect(op).toBeDefined()
  expect(norm(op!.oldValue)).toContain(slash(from))
  expect(norm(op!.newValue)).toContain(slash(to))
})

// ── Test 2: applyIntegrity schreibt Slash-/Backslash-/JSON-escaped-Formen um ─

test('applyIntegrity(move) schreibt alle drei Pfadformen in separaten Dateien um', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'archiv-regel', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'archiv-regel', 'SKILL.md')

  writeText(from, '# Archiv Regel\n')

  // Slash-Form
  const slashFile = sandboxPath(sb, 'docs', 'ref-slash.md')
  writeText(slashFile, `Pfad: ${slash(from)}\n`)

  // Backslash-Form (nur Windows-relevant, aber beide Forms sollen gehen)
  const backslashFile = sandboxPath(sb, 'docs', 'ref-backslash.md')
  writeText(backslashFile, `Pfad: ${from}\n`)

  // JSON-Form: JSON.stringify escaped Backslashes realistisch einfach
  const jsonFile = sandboxPath(sb, 'docs', 'ref-json.json')
  writeText(jsonFile, JSON.stringify({ path: from }))

  // Preview + Apply
  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  // STUB → schlägt fehl
  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(true)
  expect(apply.data?.rolledBack).toBe(false)

  expect(readText(slashFile)).toContain(slash(to))
  expect(readText(slashFile)).not.toContain(slash(from))

  expect(readText(backslashFile)).toContain(to)
  expect(readText(backslashFile)).not.toContain(from)

  const afterJson = JSON.parse(readText(jsonFile)) as { path: string }
  expect(afterJson.path).toBe(to)
})

// ── Test 3: Ambiger Wikilink → Blocker, KEINE FS-Mutation ─────────────────

test('applyIntegrity(move) blockiert bei ambigem Wikilink VOR FS-Mutation', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  // Basename-aendernder Move + zwei gleichnamige Artefakte → Wikilink ambig
  const from = sandboxPath(sb, 'skills', 'cross-tool.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'cross-tool-neu.md')

  writeText(from, '# Cross Tool\n')
  // Zweites Artefakt mit gleichem Basename → [[cross-tool]] nicht eindeutig
  writeText(sandboxPath(sb, 'notes', 'cross-tool.md'), '# anderes cross-tool\n')
  // Doc mit ambigem Wikilink
  writeText(sandboxPath(sb, 'docs', 'ref-amb.md'), 'Siehe [[cross-tool]].\n')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  // STUB → schlägt fehl; nach Implementierung: Plan hat Blocker ambiguous-wikilink
  expect(preview.error).toBeNull()
  const plan = preview.data!
  const blocker = plan.blockers.find(b => b.code === 'ambiguous-wikilink')
  expect(blocker).toBeDefined()

  // Apply muss VOR FS-Mutation abbrechen
  const apply = await applyIntegrity(
    { plan, planHash: plan.planHash },
    ctx(sb)
  )
  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)

  // Quelle muss noch existieren, Ziel darf nicht angelegt worden sein
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)
})

// ── Test 4: Truncation → Blocker oder exhaustiver Scan (kein falsches Clean) ─

test('Plan mit truncated=true führt zu Blocker statt sauberem Apply', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  // Invariante (Plan-Kommentar): Ein gedeckelter Preview ist kein Clean-Beweis.
  // Wenn der Scan deckeln würde (truncated=true), muss ein Blocker 'truncated'
  // gesetzt sein und applyIntegrity darf KEINE FS-Mutation vornehmen.
  // Wenn der Scan exhaustiv ist (truncated=false), darf kein Blocker gesetzt sein.
  const from = sandboxPath(sb, 'skills', 'big-skill', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'big-skill', 'SKILL.md')

  writeText(from, '# Big Skill\n')

  // Viele Referenzdateien anlegen (> typisches Scan-Limit)
  for (let i = 0; i < 60; i++) {
    writeText(
      sandboxPath(sb, 'docs', `ref-${i}.md`),
      `Pfad: ${slash(from)}\n`
    )
  }

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  // STUB → schlägt fehl; nach Implementierung:
  // Entweder truncated=false (exhaustiver Scan, kein Blocker) ODER
  // truncated=true + Blocker 'truncated' + kein Apply.
  expect(preview.error).toBeNull()
  const plan = preview.data!

  if (plan.truncated) {
    const truncatedBlocker = plan.blockers.find(b => b.code === 'truncated')
    expect(truncatedBlocker).toBeDefined()

    const apply = await applyIntegrity(
      { plan, planHash: plan.planHash },
      ctx(sb)
    )
    expect(apply.data?.applied).toBe(false)
    expect(existsSync(from)).toBe(true)
    expect(existsSync(to)).toBe(false)
  } else {
    // Exhaustiver Scan: alle 60 Dateien erfasst, kein truncated-Blocker
    expect(plan.blockers.find(b => b.code === 'truncated')).toBeUndefined()
    expect(plan.scannedFiles).toBeGreaterThanOrEqual(60)
  }
})

// ── Test 5: Idempotenz — zweiter Preview nach erfolgreichem Move ist clean ──

test('zweiter previewIntegrity nach Apply liefert 0 referenceOps (idempotent)', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'plan-disziplin', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'plan-disziplin', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Plan Disziplin\n')
  writeDeps(deps, 'plan-disziplin', from)

  // Erster Durchlauf
  const preview1 = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview1.error).toBeNull()

  await applyIntegrity(
    { plan: preview1.data!, planHash: preview1.data!.planHash },
    ctx(sb)
  )

  // Nach Apply: deps zeigt auf `to`; zweiter Preview findet keine alten Referenzen mehr
  const preview2 = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: to, to: join(sb.configDir, 'final', 'SKILL.md') } },
    ctx(sb)
  )

  // STUB → schlägt fehl; nach Implementierung: 0 referenceOps auf alten `from`-Pfad
  expect(preview2.error).toBeNull()
  const opsOnOldFrom = preview2.data!.referenceOps.filter(o =>
    o.oldValue.includes(slash(from))
  )
  expect(opsOnOldFrom.length).toBe(0)

  // Aktueller Dep-Eintrag zeigt auf `to`
  const dep = readDep(deps, 'plan-disziplin')
  expect(dep.canonical_source).toBe(to)
})
