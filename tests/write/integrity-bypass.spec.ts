// integrity-bypass.spec.ts — behavioraler Beweis (W6), dass KEINE alte Mutations-
// Route Referenzen liegen laesst. Insbesondere: ORDNER-Moves ueber
// moveEntryVersioned / renameEntry / writeMoveDir-IPC ziehen ihre Referenzen
// nach (W5-Root-Cause-Fix). Temp-Sandbox only, keine Realpfade (assertNotRealHome).
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { moveEntryVersioned, renameEntry } from '../../src/main/services/rename-move'
import { applyDirAction } from '../../src/main/services/apply'
import { applyIntegrity, previewIntegrity } from '../../src/main/services/integrity/apply-integrity'
import { makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, writeText, readText } from './integrity-helpers'

// Fall 1: Ordner-Move via moveEntryVersioned -> Ref zeigt auf NEUEN Ordnerpfad.
test('moveEntryVersioned (Ordner) zieht Referenzen auf den neuen Ordnerpfad nach', () => {
  const sb = makeSandbox()
  const fromDir = sandboxPath(sb, 'rules', 'foo')
  const toDir = sandboxPath(sb, 'skills', 'foo')
  const inner = join(fromDir, 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'surface.md')
  writeText(inner, '# Foo\n')
  // Referenz auf Unterpfad des Ordners (Substring-Rewrite muss greifen).
  writeText(doc, `Loader: ${slash(join(fromDir, 'SKILL.md'))}\n`)

  const res = moveEntryVersioned({ version: 'shared', fromPath: fromDir, to: toDir }, ctx(sb))

  const after = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(fromDir)).toBe(false)
  expect(existsSync(join(toDir, 'SKILL.md'))).toBe(true)
  expect(after).toContain(slash(join(toDir, 'SKILL.md')))
  expect(after).not.toContain(slash(fromDir))
})

// Fall 2: Ordner-Move via renameEntry (sides:'shared') -> Ref auf neuen Pfad.
test('renameEntry (Ordner) zieht Referenzen auf den umbenannten Ordnerpfad nach', () => {
  const sb = makeSandbox()
  const fromDir = sandboxPath(sb, 'skills', 'routing')
  const newDir = join(sandboxPath(sb, 'skills'), 'routing-neu')
  const inner = join(fromDir, 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'reference.md')
  writeText(inner, '# Routing\n')
  writeText(doc, `Pfad: ${slash(join(fromDir, 'SKILL.md'))}\n`)

  const res = renameEntry({
    sides: 'shared',
    newName: 'routing-neu',
    shared: { side: 'shared', path: fromDir }
  }, ctx(sb))

  const after = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(fromDir)).toBe(false)
  expect(existsSync(join(newDir, 'SKILL.md'))).toBe(true)
  expect(after).toContain(slash(join(newDir, 'SKILL.md')))
  // Voller alter Datei-Pfad darf nicht mehr vorkommen (fromDir selbst ist
  // Substring von newDir 'routing' -> 'routing-neu', daher Datei-Pfad pruefen).
  expect(after).not.toContain(slash(join(fromDir, 'SKILL.md')))
})

// Fall 3: Datei-Move via moveEntryVersioned (Regressionssicherung, war gruen).
test('moveEntryVersioned (Datei) zieht Referenzen weiterhin nach', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'skills', 'code-quality', 'SKILL.md')
  const to = sandboxPath(sb, 'userglobal', 'skills', 'code-quality', 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'file-surface.md')
  writeText(from, '# Code Quality\n')
  writeText(doc, `Loader: ${slash(from)}\n`)

  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to }, ctx(sb))

  const after = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(from)).toBe(false)
  expect(after).toContain(slash(to))
  expect(after).not.toContain(slash(from))
})

// Fall 4: oeffentliche Dir-Move-Route (applyDirAction move-dir, wie writeMoveDir-IPC
// sie aufruft: ownerMove=true) -> Ref auf neuen Ordnerpfad.
test('applyDirAction move-dir (IPC-Route) zieht Referenzen auf den neuen Pfad nach', () => {
  const sb = makeSandbox()
  const fromDir = sandboxPath(sb, 'agents', 'alt')
  const toDir = sandboxPath(sb, 'agents', 'neu')
  const inner = join(fromDir, 'AGENT.md')
  const doc = sandboxPath(sb, 'docs', 'dir-surface.md')
  mkdirSync(toDir, { recursive: true })
  writeText(inner, '# Agent\n')
  writeText(doc, `Ref: ${slash(join(fromDir, 'AGENT.md'))}\n`)

  const res = applyDirAction(
    { action: 'move-dir', path: fromDir, to: join(toDir, 'alt'), ownerMove: true },
    ctx(sb)
  )

  const after = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(fromDir)).toBe(false)
  expect(after).toContain(slash(join(toDir, 'alt', 'AGENT.md')))
  expect(after).not.toContain(slash(fromDir))
})

test('applyIntegrity(move Datei) rollt Fehler nach FS-Move zurueck', async () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'move-source.md')
  const to = sandboxPath(sb, 'rules', 'move-target.md')
  writeText(from, '# Move Source\n')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks: { beforeReferences: () => { throw new Error('injected-after-fs') } } })
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(apply.data?.partial).toBe(false)
  expect(apply.data?.rolledBack).toBe(true)
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)
})

test('applyIntegrity(move Ordner) rollt Fehler nach FS-Move zurueck', async () => {
  const sb = makeSandbox()
  const fromDir = sandboxPath(sb, 'agents', 'move-alt')
  const toDir = sandboxPath(sb, 'agents', 'move-neu')
  writeText(join(fromDir, 'AGENT.md'), '# Agent\n')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: fromDir, to: toDir } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks: { beforeReferences: () => { throw new Error('injected-after-fs') } } })
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(apply.data?.partial).toBe(false)
  expect(apply.data?.rolledBack).toBe(true)
  expect(existsSync(join(fromDir, 'AGENT.md'))).toBe(true)
  expect(existsSync(toDir)).toBe(false)
})

test('applyIntegrity(move) erlaubt owner-freies Ziel, aber keine out-of-scope Quelle', async () => {
  const sb = makeSandbox()
  const inScope = sandboxPath(sb, 'rules', 'owner-source.md')
  const outsideDir = join(sb.root, 'outside')
  const outsideSource = join(outsideDir, 'evil-source.md')
  const outsideTarget = join(outsideDir, 'owner-target.md')
  writeText(inScope, '# Owner Source\n')
  writeText(outsideSource, '# Evil Source\n')

  const okPreview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: inScope, to: outsideTarget } },
    ctx(sb)
  )
  expect(okPreview.error).toBeNull()
  const okApply = await applyIntegrity(
    { plan: okPreview.data!, planHash: okPreview.data!.planHash },
    ctx(sb)
  )
  expect(okApply.error).toBeNull()
  expect(okApply.data?.applied).toBe(true)
  expect(existsSync(outsideTarget)).toBe(true)

  const badPreview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: outsideSource, to: join(outsideDir, 'moved.md') } },
    ctx(sb)
  )
  expect(badPreview.error).toBeNull()
  const badApply = await applyIntegrity(
    { plan: badPreview.data!, planHash: badPreview.data!.planHash },
    ctx(sb)
  )
  expect(badApply.error).toBe('out-of-scope')
  expect(existsSync(outsideSource)).toBe(true)
})

test('applyIntegrity lehnt manipulierte out-of-scope referenceOps vor Snapshot ab', async () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'safe-source.md')
  const to = sandboxPath(sb, 'rules', 'safe-target.md')
  const outsideRef = join(sb.root, 'outside-ref.md')
  writeText(from, '# Safe Source\n')
  writeText(outsideRef, `Ref: ${slash(from)}\n`)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  const manipulated = {
    ...preview.data!,
    referenceOps: [{
      filePath: outsideRef,
      kind: 'path' as const,
      oldValue: slash(from),
      newValue: slash(to)
    }]
  }

  const apply = await applyIntegrity(
    { plan: manipulated, planHash: manipulated.planHash },
    ctx(sb)
  )

  expect(apply.error).toBe('plan-hash-mismatch')

  const planHash = await import('../../src/main/services/integrity/plan-hash')
  const forgedHash = planHash.computePlanHash(manipulated.kind, manipulated.fsOps, manipulated.referenceOps)
  const forged = await applyIntegrity(
    { plan: { ...manipulated, planHash: forgedHash }, planHash: forgedHash },
    ctx(sb)
  )
  expect(forged.error).toBe('plan-token-mismatch')
  expect(readText(outsideRef)).toContain(slash(from))
  expect(readText(outsideRef)).not.toContain(slash(to))
})

test('applyIntegrity lehnt manipulierten Plan mit selbst berechnetem Hash ab', async () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'token-source.md')
  const to = sandboxPath(sb, 'rules', 'token-target.md')
  const forgedTo = sandboxPath(sb, 'rules', 'token-forged.md')
  writeText(from, '# Token Source\n')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  const planHash = await import('../../src/main/services/integrity/plan-hash')
  const fsOps = [{ ...preview.data!.fsOps[0], to: forgedTo }]
  const forgedHash = planHash.computePlanHash(preview.data!.kind, fsOps, preview.data!.referenceOps)
  const forged = { ...preview.data!, fsOps, planHash: forgedHash }

  const apply = await applyIntegrity({ plan: forged, planHash: forgedHash }, ctx(sb))

  expect(apply.error).toBe('plan-token-mismatch')
  expect(existsSync(from)).toBe(true)
  expect(existsSync(forgedTo)).toBe(false)
})

test('applyIntegrity lehnt entfernte Blocker trotz gueltigem Preview-Token ab', async () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'blocked-source.md')
  const to = sandboxPath(sb, 'rules', 'blocked-target.md')
  writeText(from, '# Blocked Source\n')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  const planHash = await import('../../src/main/services/integrity/plan-hash')
  const token = await import('../../src/main/services/integrity/plan-token')
  const blocked = {
    ...preview.data!,
    blockers: [{ code: 'ambiguous-wikilink' as const, path: from, reason: 'test-blocker' }],
    manualRequired: [{ filePath: from, reason: 'manual-test' }],
    truncated: true
  }
  const blockedHash = planHash.computePlanHash(blocked.kind, blocked.fsOps, blocked.referenceOps, {
    blockers: blocked.blockers,
    manualRequired: blocked.manualRequired,
    truncated: blocked.truncated
  })
  const signedBlocked = { ...blocked, planHash: blockedHash, previewToken: token.signPreviewPlan({
    kind: blocked.kind,
    operationId: blocked.operationId,
    planHash: blockedHash
  }) }

  const tampered = { ...signedBlocked, blockers: [], manualRequired: [], truncated: false }
  const apply = await applyIntegrity({ plan: tampered, planHash: signedBlocked.planHash }, ctx(sb))

  expect(apply.error).toBe('plan-hash-mismatch')
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)
})
