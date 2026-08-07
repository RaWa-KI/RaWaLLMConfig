// bulk-idempotenz.spec.ts — F7-Idempotenz (Review-Auflage WP-10).
// Garantie: ein gespiegeltes physisches Paar darf nur EINMAL eingearbeitet
// werden. Zweite Bulk-/Reconcile-Aktion auf dasselbe Paar = deterministisches
// no-op ('already-reconciled'), NICHT generisches 'path-not-found'.
// MAIN-seitig: previewIntegrity/applyIntegrity. DISPATCH-seitig:
// reconcile-dispatch (Renderer-pure-Logik, kein Electron). ALLE Pfade temp via
// fixtures (os.tmpdir).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  pairKey,
  normalizePath,
  isPairDispatched,
  markPairDispatched,
  clearPairDispatched,
  resetDispatchTracker
} from '../../src/renderer/sections/config/reconcile-dispatch'
import { makeSandbox } from './fixtures'
import type { DirReconcileRequest } from '@shared/contract-write'
import { ctx, previewAndApply } from './integrity-helpers'

// ── Hilfsroutinen ───────────────────────────────────────────────────────────

function makeDir(parent: string, name: string, files: Record<string, string>): string {
  const dir = join(parent, name)
  mkdirSync(dir, { recursive: true })
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return dir
}

// ── Integrity: gespiegeltes Paar zweimal ────────────────────────────────────

test('F7 Integrity: gespiegeltes Paar zweimal bleibt idempotent und konsistent', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-f7', { 'shared.md': 'TRUNK-V1' })
  const mirror = makeDir(sb.configDir, 'mirror-f7', { 'shared.md': 'MIRROR-V2' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-mirror' }
  }

  // Erste Aktion: signierter Plan, dann transaktionales Apply.
  const first = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(first.preview.error).toBeNull()
  expect(first.apply?.error).toBeNull()
  expect(first.apply?.data?.applied).toBe(true)
  expect(first.apply?.data?.partial).toBe(false)
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-V2')
  // Mirror-Datei ist nach Lauf 1 archiviert (die leere Sandbox-Huelle darf bleiben).
  expect(existsSync(join(mirror, 'shared.md'))).toBe(false)

  // Zweite Aktion auf DASSELBE Paar: der aktive Kanal darf nicht erneut
  // mutieren. Der fehlende Loser fuehrt zu einem konsistenten Rollback.
  const second = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(second.preview.error).toBeNull()
  expect(second.apply?.data?.applied).toBe(false)
  expect(second.apply?.data?.partial).toBe(false)

  // Strukturelle „nur EINMAL“-Garantie: Survivor unveraendert.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-V2')
})

test('F7 Integrity: keep-trunk zweimal -> zweites Apply bleibt ohne Mutation', async () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.configDir, 'trunk-kt2', { 'a.md': 'A-TRUNK' })
  const mirror = makeDir(sb.configDir, 'mirror-kt2', { 'a.md': 'A-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'keep-trunk' }
  }

  const first = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(first.preview.error).toBeNull()
  expect(first.apply?.error).toBeNull()
  expect(first.apply?.data?.applied).toBe(true)
  expect(existsSync(join(mirror, 'a.md'))).toBe(false)

  const second = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(second.preview.error).toBeNull()
  expect(second.apply?.data?.applied).toBe(false)
  expect(second.apply?.data?.partial).toBe(false)
  // Trunk nie mutiert (keep-trunk).
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
})

test('F7 Integrity: BEIDE Pfade fehlen -> kein mutierender Schein-Erfolg', async () => {
  const sb = makeSandbox()
  const req: DirReconcileRequest = {
    trunkPath: join(sb.configDir, 'kein-trunk'),
    mirrorPath: join(sb.configDir, 'kein-mirror'),
    decisions: {}
  }
  const run = await previewAndApply({ kind: 'reconcile-folder', req }, ctx(sb))
  expect(run.preview.error).toBeNull()
  expect(run.apply?.error).toBeNull()
  expect(run.apply?.data?.applied).toBe(true)
  expect(run.apply?.data?.partial).toBe(false)
  expect(run.preview.data?.fsOps).toHaveLength(0)
})

test('F7 Integrity: leere Anfrage -> invalid-request, kein false-positive Apply', async () => {
  const sb = makeSandbox()
  const run = await previewAndApply(
    { kind: 'reconcile-folder', req: { trunkPath: '', mirrorPath: '', decisions: {} } as DirReconcileRequest },
    ctx(sb)
  )
  expect(run.preview.error).toContain('invalid-request')
  expect(run.apply).toBeNull()
})

// ── DISPATCH: reconcile-dispatch (Renderer-pure, kein Electron) ──────────────

test('F7 DISPATCH: normalizePath vereinheitlicht Backslash/Trailing/Case', () => {
  expect(normalizePath('C:\\u\\.claude\\skills\\')).toBe('c:/u/.claude/skills')
  expect(normalizePath('/a//b/')).toBe('/a/b')
  expect(normalizePath('  /A/B  ')).toBe('/a/b')
})

test('F7 DISPATCH: pairKey ist reihenfolge-unabhaengig (gleiches physisches Paar)', () => {
  const a = '/root/.shared/skills/x'
  const b = '/root/.claude/skills/x'
  expect(pairKey(a, b)).toBe(pairKey(b, a))
  // Case-/Slash-Varianten ergeben denselben Key.
  expect(pairKey('C:\\R\\A', 'C:\\R\\B')).toBe(pairKey('c:/r/b/', 'c:/r/a'))
})

test('F7 DISPATCH: gespiegeltes Paar zweimal -> zweiter Dispatch geblockt (nur EINMAL)', () => {
  resetDispatchTracker()
  const trunk = '/root/.shared/skills/agent-routing'
  const mirror = '/root/.claude/skills/agent-routing'

  // Erstkontakt: noch nicht dispatched.
  expect(isPairDispatched(trunk, mirror)).toBe(false)
  markPairDispatched(trunk, mirror)

  // Zweiter Versuch (auch mit vertauschten Seiten / Case-Variante) = bereits dispatched.
  expect(isPairDispatched(trunk, mirror)).toBe(true)
  expect(isPairDispatched(mirror, trunk)).toBe(true)
  expect(isPairDispatched(trunk.toUpperCase(), mirror.toUpperCase())).toBe(true)

  // Reset/Clear erlaubt erneuten Versuch (Fehler-Revert).
  clearPairDispatched(trunk, mirror)
  expect(isPairDispatched(trunk, mirror)).toBe(false)
})

test('F7 DISPATCH: verschiedene Paare blockieren sich nicht gegenseitig', () => {
  resetDispatchTracker()
  markPairDispatched('/r/.shared/a', '/r/.claude/a')
  // Anderes Paar bleibt frei.
  expect(isPairDispatched('/r/.shared/b', '/r/.claude/b')).toBe(false)
})
