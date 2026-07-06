// reconcile-reference-integrity.spec.ts — Failing Specs für W3/W6 (TDD).
// Prüft: Reconcile-Entscheidungen (keep-trunk/keep-mirror/adopt-mirror) schreiben
// Referenzen auf den Survivor um; Ordner-Reconcile mappt je rel-Pfad;
// Secret-artige Dateien erscheinen in manualRequired, nicht als clean.
// Alle Assertions schlagen mit dem STUB fehl — ROT aus dem richtigen Grund.
import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, writeText, readText, writeDeps, readDep } from './integrity-helpers'
import {
  previewIntegrity,
  applyIntegrity
} from '../../src/main/services/integrity/apply-integrity'

// ── Test 1: keep-trunk + keep-mirror → Survivor-Referenzen korrekt ────────

test('applyIntegrity(reconcile keep-trunk) schreibt Referenzen auf Trunk vor Archivierung des Losers', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const trunk  = sandboxPath(sb, 'shared', 'rules', 'token-effizienz.md')
  const mirror = sandboxPath(sb, 'userglobal', 'rules', 'token-effizienz.md')
  const deps   = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')
  const doc    = sandboxPath(sb, 'docs', 'surface.md')

  writeText(trunk,  '# Token Effizienz (trunk)\n')
  writeText(mirror, '# Token Effizienz (mirror)\n')
  writeDeps(deps, 'token-effizienz', mirror)  // zeigt noch auf Mirror
  writeText(doc, `Loader: ${slash(mirror)}\n`)

  const preview = await previewIntegrity(
    { kind: 'reconcile', req: { trunkPath: trunk, mirrorPath: mirror, decision: 'keep-trunk' } },
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

  // Loser (mirror) muss weg sein
  expect(existsSync(mirror)).toBe(false)

  // Referenzen zeigen auf Survivor (trunk)
  const dep = readDep(deps, 'token-effizienz')
  expect(dep.canonical_source).toBe(trunk)
  expect(dep.loader_path).toBe(trunk)

  const afterDoc = readText(doc)
  expect(afterDoc).toContain(slash(trunk))
  expect(afterDoc).not.toContain(slash(mirror))
})

// ── Test 2: adopt-mirror → Inhalt übernommen + Referenzen auf Survivor ────

test('applyIntegrity(reconcile adopt-mirror) übernimmt Inhalt und schreibt Referenzen auf Trunk', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const trunk  = sandboxPath(sb, 'shared', 'skills', 'graphify', 'SKILL.md')
  const mirror = sandboxPath(sb, 'userglobal', 'skills', 'graphify', 'SKILL.md')

  writeText(trunk,  '# Graphify v1\n')
  writeText(mirror, '# Graphify v2 (aktuell)\n')

  const ref = sandboxPath(sb, 'docs', 'skill-index.md')
  writeText(ref, `Pfad: ${slash(mirror)}\n`)

  const preview = await previewIntegrity(
    { kind: 'reconcile', req: { trunkPath: trunk, mirrorPath: mirror, decision: 'adopt-mirror' } },
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

  // Trunk hat jetzt den Mirror-Inhalt
  expect(readText(trunk)).toContain('v2')

  // Mirror ist weg (archiviert)
  expect(existsSync(mirror)).toBe(false)

  // Referenzen zeigen auf Trunk
  const afterRef = readText(ref)
  expect(afterRef).toContain(slash(trunk))
  expect(afterRef).not.toContain(slash(mirror))
})

// ── Test 3: Ordner-Reconcile — je rel-Pfad loser→survivor gemappt ─────────

test('applyIntegrity(reconcile-folder) mappt gemischte Entscheidungen je rel-Pfad auf Survivor', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const trunkDir  = sandboxPath(sb, 'shared', 'skills', 'routing')
  const mirrorDir = sandboxPath(sb, 'userglobal', 'skills', 'routing')

  const trunkFile1  = join(trunkDir,  'SKILL.md')
  const mirrorFile1 = join(mirrorDir, 'SKILL.md')
  const trunkFile2  = join(trunkDir,  'README.md')
  const mirrorFile2 = join(mirrorDir, 'README.md')

  writeText(trunkFile1,  '# Routing Skill (trunk)\n')
  writeText(mirrorFile1, '# Routing Skill (mirror)\n')
  writeText(trunkFile2,  '# README trunk\n')
  writeText(mirrorFile2, '# README mirror\n')

  // Zwei Survivor-Seiten: SKILL.md → Trunk survives; README.md → Mirror survives
  const refDoc = sandboxPath(sb, 'docs', 'dir-surface.md')
  writeText(refDoc, [
    `SKILL: ${slash(mirrorFile1)}`,
    `README: ${slash(trunkFile2)}`
  ].join('\n'))

  const preview = await previewIntegrity(
    {
      kind: 'reconcile-folder',
      req: {
        trunkPath: trunkDir,
        mirrorPath: mirrorDir,
        decisions: { 'SKILL.md': 'keep-trunk', 'README.md': 'keep-mirror' }
      }
    },
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

  // SKILL.md: Trunk survives, Mirror weg
  expect(existsSync(trunkFile1)).toBe(true)
  expect(existsSync(mirrorFile1)).toBe(false)

  // README.md: Mirror survives (übernommen), Trunk weg
  expect(existsSync(mirrorFile2)).toBe(true)
  expect(existsSync(trunkFile2)).toBe(false)

  // Referenzen: mirrorFile1 → trunkFile1; trunkFile2 → mirrorFile2
  const afterRef = readText(refDoc)
  expect(afterRef).toContain(slash(trunkFile1))
  expect(afterRef).not.toContain(slash(mirrorFile1))
  expect(afterRef).toContain(slash(mirrorFile2))
  expect(afterRef).not.toContain(slash(trunkFile2))
})

// ── Test 4: Secret-Skip erscheint in manualRequired, nicht als clean ───────

test('applyIntegrity(reconcile) meldet secret-artige Datei in manualRequired statt als clean', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const trunk  = sandboxPath(sb, 'shared', 'rules', 'token-rule.md')
  const mirror = sandboxPath(sb, 'userglobal', 'rules', 'token-rule.md')

  writeText(trunk,  '# Token Rule\n')
  writeText(mirror, '# Token Rule mirror\n')

  // Secret-artige Datei im Sandbox — referenziert den Mirror-Pfad
  // Kein echtes Secret — aber Dateiname löst Secret-Guard aus
  const secretLike = sandboxPath(sb, 'auth.json')
  writeText(secretLike, JSON.stringify({ loader_path: slash(mirror) }))

  const preview = await previewIntegrity(
    { kind: 'reconcile', req: { trunkPath: trunk, mirrorPath: mirror, decision: 'keep-trunk' } },
    ctx(sb)
  )

  // STUB → schlägt fehl; nach Implementierung:
  // auth.json darf nicht als referenz-clean verkauft werden → manualRequired
  expect(preview.error).toBeNull()
  const plan = preview.data!

  const manual = plan.manualRequired.find(m => m.filePath === secretLike)
  expect(manual).toBeDefined()

  // Kein roher Secret-Wert in der Reason
  expect(manual?.reason).not.toContain(slash(mirror))
})
