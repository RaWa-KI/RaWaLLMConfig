// reference-verify-scope.spec.ts — Zusicherungen der plan-gezielten Verify-Phase.
// Die Verify-Phase prueft seit dem Performance-Umbau GENAU die Dateien aus
// plan.referenceOps statt den gesamten Baum erneut zu scannen (der Voll-Rescan
// lief pro fsOp einmal und liess die App bei grossen Wurzeln einfrieren).
// Diese Spec pinnt beide Seiten des Trade-offs: Rewrite-Ausfaelle in Plan-Dateien
// werden weiterhin erkannt, neu entstandene Fremd-Referenzen nicht mehr.
// Temp-Sandbox only, keine Realpfade, keine Secrets.
import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import { ctx, slash, writeText, readText, writeDeps, readDep } from './integrity-helpers'
import {
  previewIntegrity,
  applyIntegrity
} from '../../src/main/services/integrity/apply-integrity'
import type { ReferenceOp } from '../../shared/contract-integrity'

// ── Test 1: Rewrite-Ausfall in einer Plan-Datei -> verify-failed + Rollback ──

test('Verify erkennt zurueckgeschriebene Alt-Referenz in einer Plan-Datei und rollt zurueck', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'verify-scope', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'verify-scope', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')

  writeText(from, '# Verify Scope\n')
  writeDeps(deps, 'verify-scope', from)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  // deps steht als Referenzdatei im Plan — genau sie wird spaeter geprueft.
  expect(preview.data!.referenceOps.some((op: ReferenceOp) => op.filePath === deps)).toBe(true)

  // Simulierter Rewrite-Ausfall: nach der Referenz-Phase steht der alte Needle
  // wieder in der Plan-Datei (z.B. Fremdprozess, fehlgeschlagener Teil-Write).
  const hooks = {
    afterReferences: (): void => { writeDeps(deps, 'verify-scope', from) }
  }

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks })
  )

  // Rollback ist der Sollzustand: kein Fehler nach aussen, aber nichts angewandt.
  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(apply.data?.partial).toBe(false)
  expect(apply.data?.rolledBack).toBe(true)
  expect(apply.data?.rollbackStatus).toBe('rolled-back')

  // Quelle wieder da, Ziel weg, Referenz zeigt wieder auf den Altpfad.
  expect(existsSync(from)).toBe(true)
  expect(existsSync(to)).toBe(false)
  expect(readDep(deps, 'verify-scope').canonical_source).toBe(from)
})

// ── Test 2: dokumentierter Trade-off — Fremd-Datei nach Preview blockiert nicht ─

test('Nach dem Preview neu entstandene Fremd-Referenz verhindert den Apply nicht mehr', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const from = sandboxPath(sb, 'skills', 'late-ref', 'SKILL.md')
  const to   = sandboxPath(sb, 'userglobal', 'skills', 'late-ref', 'SKILL.md')
  const known = sandboxPath(sb, 'docs', 'known-surface.md')
  const late  = sandboxPath(sb, 'docs', 'late-surface.md')

  writeText(from, '# Late Ref\n')
  writeText(known, `Pfad: ${slash(from)}\n`)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: from, to } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  expect(preview.data!.referenceOps.some((op: ReferenceOp) => op.filePath === late)).toBe(false)

  // Erst NACH dem Preview entsteht eine weitere Datei mit dem Altpfad. Sie ist
  // nicht Teil des signierten Plans (planHash) und damit bewusst ausserhalb der
  // Verify-Zusicherung — wie jede Referenz, die nach der Operation entsteht.
  const hooks = {
    beforeReferences: (): void => { writeText(late, `Spaeter: ${slash(from)}\n`) }
  }

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb, { hooks })
  )

  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(true)
  expect(apply.data?.rolledBack).toBe(false)
  expect(existsSync(to)).toBe(true)

  // Plan-Datei ist umgeschrieben, die spaete Fremd-Datei bleibt unveraendert.
  expect(readText(known)).toContain(slash(to))
  expect(readText(known)).not.toContain(slash(from))
  expect(readText(late)).toContain(slash(from))
})

// ── Test 3: archivierter Loser behaelt seine alten Verweise (kein Rollback) ──

test('Ordner-Merge: der archivierte Loser behaelt seine Alt-Referenzen, ohne den Apply zu kippen', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const trunkDir  = sandboxPath(sb, 'shared', 'skills', 'loser-ref')
  const mirrorDir = sandboxPath(sb, 'userglobal', 'skills', 'loser-ref')
  const trunkFile  = sandboxPath(sb, 'shared', 'skills', 'loser-ref', 'SKILL.md')
  const mirrorFile = sandboxPath(sb, 'userglobal', 'skills', 'loser-ref', 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'loser-surface.md')

  writeText(trunkFile, '# Loser Ref (trunk)\n')
  // Der Loser referenziert seinen EIGENEN alten Pfad — nach der Archivierung ist
  // er am Altpfad nicht mehr lesbar und wird beim Rewrite uebersprungen.
  writeText(mirrorFile, `# Loser Ref (mirror)\nLoader: ${slash(mirrorFile)}\n`)
  writeText(doc, `Loader: ${slash(mirrorFile)}\n`)

  const preview = await previewIntegrity(
    {
      kind: 'reconcile-folder',
      req: { trunkPath: trunkDir, mirrorPath: mirrorDir, decisions: { 'SKILL.md': 'keep-trunk' } }
    },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  // Beide Dateien stehen im Plan — auch der Loser selbst.
  expect(preview.data!.referenceOps.some((op: ReferenceOp) => op.filePath === mirrorFile)).toBe(true)
  expect(preview.data!.referenceOps.some((op: ReferenceOp) => op.filePath === doc)).toBe(true)

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  // Unlesbarer Loser ist KEIN verify-Fehler: die Operation geht sauber durch.
  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(true)
  expect(apply.data?.rolledBack).toBe(false)
  expect(existsSync(mirrorFile)).toBe(false)

  // Die fremde Referenzdatei zeigt jetzt auf den Survivor.
  expect(readText(doc)).toContain(slash(trunkFile))
  expect(readText(doc)).not.toContain(slash(mirrorFile))
})

// ── Test 4: mitverschobene Referenzdatei wird am NEUEN Pfad geprueft ─────────

test('Referenzdatei innerhalb des verschobenen Ordners wird am neuen Pfad verifiziert', async () => {
  const sb = makeSandbox()
  assertNotRealHome(sb.configDir)

  const fromDir = sandboxPath(sb, 'skills', 'selbstbezug')
  const toDir   = sandboxPath(sb, 'userglobal', 'skills', 'selbstbezug')
  const inner   = sandboxPath(sb, 'skills', 'selbstbezug', 'SKILL.md')

  // Die verschobene Datei referenziert ihren eigenen alten Ordnerpfad.
  writeText(inner, `# Selbstbezug\nLoader: ${slash(inner)}\n`)

  const preview = await previewIntegrity(
    { kind: 'move', req: { version: 'shared', fromPath: fromDir, to: toDir } },
    ctx(sb)
  )
  expect(preview.error).toBeNull()
  expect(preview.data!.referenceOps.some((op: ReferenceOp) => op.filePath === inner)).toBe(true)

  const apply = await applyIntegrity(
    { plan: preview.data!, planHash: preview.data!.planHash },
    ctx(sb)
  )

  // Der Rewrite greift nicht mehr am Altpfad (Datei ist mitverschoben), daher
  // muss Verify am NEUEN Pfad anschlagen und die Operation zurueckrollen.
  expect(apply.error).toBeNull()
  expect(apply.data?.applied).toBe(false)
  expect(apply.data?.rolledBack).toBe(true)
  expect(existsSync(inner)).toBe(true)
})
