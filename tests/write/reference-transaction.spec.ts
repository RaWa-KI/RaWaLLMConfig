// reference-transaction.spec.ts — Failing Specs für W3 (TDD, Kern-Transaktion).
// Prüft: Backup-first, Fehler-vor-Mutation, Hook-Rollback (beforeReferences +
// afterReferences), kaputtes JSON, Secret-Snippet-Schutz, Cross-Volume-Block.
import { test, expect } from '@playwright/test'
import { existsSync, readdirSync } from 'node:fs'
import { parse } from 'node:path'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, writeText, readText, writeDeps, readDep } from './integrity-helpers'
import {
  previewIntegrity,
  applyIntegrity
} from '../../src/main/services/integrity/apply-integrity'

// ── Test 1: Jede Referenzdatei bekommt vor Rewrite ein Backup ─────────────

test('applyIntegrity erstellt Backup/Snapshot für jede Referenzdatei vor Rewrite', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'doku-konventionen', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'doku-konventionen', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Doku Konventionen\n')
  writeDeps(deps, 'doku-konventionen', from)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(true)

  // archiveRoot muss Backup-Dateien enthalten (mindestens für deps)
  const archiveFiles = readdirSync(sb.archiveRoot, { recursive: true }) as string[]
  const hasDepBackup = archiveFiles.some(f =>
    f.includes('governance-dependencies') || f.endsWith('.json')
  )
  const hasJournal = apply.data?.journalPath !== undefined && apply.data.journalPath !== null

  expect(hasDepBackup || hasJournal).toBe(true)
})

// ── Test 2: Fehler VOR Mutation lässt Quelle/Ziel unverändert ─────────────

test('ungültiger Request (leerer to-Pfad) lässt Quelle unverändert', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'architektur-vertrag', 'SKILL.md')
  writeText(from, '# Architektur Vertrag\n')

  // Ungültiger Request: leerer Zielpfad
  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to: '' } },
    ctx(sb)
  )

  // Fehler vor Mutation: Quelle bleibt unberührt (preview-error ODER apply-abbruch).
  if (preview.error !== null) {
    // Fehler schon im Preview → Quelle unberührt
    expect(existsSync(from)).toBe(true)
    return
  }

  // Wenn Preview ok: Apply muss vor Mutation abbrechen
  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.data?.applied).toBe(false)
  expect(existsSync(from)).toBe(true)
})

// ── Test 3: Simulierter Fehler NACH Move → Rollback (Quelle wieder da) ────

test('Hook-Fehler nach FS-Move löst Rollback aus — Quelle wieder da, Ziel weg, rolledBack:true', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'briefing-format', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'briefing-format', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Briefing Format\n')
  writeDeps(deps, 'briefing-format', from)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()

  // Hook wirft nach FS-Move, also wenn Referenz-Rewrites beginnen sollen
  const hooks = {
    beforeReferences: () => { throw new Error('boom — simulierter Fehler nach Move') }
  }

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks })
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(apply.data?.rolledBack).toBe(true)
  expect(apply.data?.rollbackStatus).toBe('rolled-back')

  // Quelle wieder da, Ziel weg
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)

  // Referenzdateien unverändert (Rollback hat deps auf alten from-Pfad zurückgesetzt)
  expect(readDep(deps, 'briefing-format').canonical_source).toBe(from)
})

// ── Test 4: Simulierter Fehler NACH Ref-Rewrite → Rollback inkl. Refs ─────

test('Hook-Fehler nach Ref-Rewrite stellt Quelle + Referenzdateien aus Journal wieder her', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'credentials-protection', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'credentials-protection', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Credentials Protection\n')
  writeDeps(deps, 'credentials-protection', from)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()

  // Hook wirft NACH Ref-Rewrite (afterReferences)
  const hooks = {
    afterReferences: () => { throw new Error('boom — simulierter Fehler nach Ref-Rewrite') }
  }

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks })
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.rolledBack).toBe(true)
  expect(apply.data?.rollbackStatus).toBe('rolled-back')

  // Quelle wieder da
  expect(existsSync(from)).toBe(true)

  // Referenzdateien aus Journal wiederhergestellt — zeigen auf alten from-Pfad
  expect(readDep(deps, 'credentials-protection').canonical_source).toBe(from)
})

// ── Test 5: Kaputtes JSON wird nicht korrupt überschrieben ────────────────

test('Datei mit kaputtem JSON wird nicht korrupt überschrieben', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'plan-disziplin-v2', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'plan-disziplin-v2', 'SKILL.md')

  writeText(from, '# Plan Disziplin v2\n')

  // Kaputtes JSON: enthält alten Pfad, aber syntaktisch ungültig
  const brokenJson = sandboxPath(sb, 'config', 'broken.json')
  writeText(brokenJson, `{ "path": "${slash(from)}", KAPUTT `)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.error).toBeNull()

  // brokenJson: nach Apply parsbar ODER unverändert (kein korruptes Überschreiben).
  const afterContent = readText(brokenJson)
  let isStillBroken = false
  try {
    JSON.parse(afterContent)
  } catch {
    isStillBroken = true
  }

  if (isStillBroken) {
    // Unverändert: original kaputt ist OK (nicht angetastet)
    expect(afterContent).toBe(`{ "path": "${slash(from)}", KAPUTT `)
  } else {
    // Wurde repariert (structured rewrite) → muss auf neuen Pfad zeigen
    const parsed = JSON.parse(afterContent) as { path: string }
    expect(parsed.path).toContain(slash(to))
  }
})

// ── Test 7: Cross-Volume-Move wird vor Mutation blockiert ─────────────────

// Fremder absoluter Zielpfad auf anderem Laufwerk (POSIX ohne Buchstabe → Skip).
function foreignVolumePath(sb: { configDir: string }): string | null {
  const root = parse(sb.configDir).root // z.B. "C:\\"
  const letter = root.match(/^([A-Za-z]):/)?.[1]
  if (!letter) return null // kein Laufwerksbuchstabe (POSIX) → Test überspringen
  const other = letter.toUpperCase() === 'Z' ? 'Y' : 'Z'
  return `${other}:\\rawallm-cross-volume\\x.md`
}

test('Cross-Volume-Move wird blockiert (cross-volume-rollback-not-proven), keine Mutation', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'cross-volume', 'x.md')
  writeText(from, '# Cross Volume\n')

  const to = foreignVolumePath(sb)
  test.skip(to === null, 'Kein Laufwerksbuchstabe (POSIX) — Cross-Volume nicht abbildbar')

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to: to! } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()
  const codes = preview.data!.blockers.map((b) => b.code)
  expect(codes).toContain('cross-volume-rollback-not-proven')

  // Apply: graceful applied:false ohne Fehler, Quelle bleibt unangetastet.
  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(existsSync(from)).toBe(true)
})

// ── Test 6: Secret-ähnliche Werte nicht als rohe Snippets im Result ────────

test('apply-Result enthält keine rohen Secret-ähnlichen Wert-Snippets', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'secret-skill', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'secret-skill', 'SKILL.md')

  writeText(from, '# Secret Skill\n')

  // Datei mit secret-ähnlichem Wert (kein echter Key — nur Test-Sentinel)
  const textFile = sandboxPath(sb, 'docs', 'not-secret.md')
  const fakeKey = 'sk-ant-TEST1234567890'  // kein echtes Secret
  writeText(textFile, [
    `Pfad: ${slash(from)}`,
    `Token: ${fakeKey}`
  ].join('\n'))

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )

  expect(preview.error).toBeNull()

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  expect(apply.error).toBeNull()

  // Result-JSON darf keinen rohen fakeKey enthalten
  const resultStr = JSON.stringify(apply.data)
  expect(resultStr).not.toContain(fakeKey)

  // Auch journalPath-Inhalt darf fakeKey nicht tragen
  if (apply.data?.journalPath) {
    const journalContent = readText(apply.data.journalPath)
    expect(journalContent).not.toContain(fakeKey)
  }
})
