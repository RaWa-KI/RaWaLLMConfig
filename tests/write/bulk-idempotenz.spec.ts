// bulk-idempotenz.spec.ts — F7-Idempotenz (Review-Auflage WP-10).
// Garantie: ein gespiegeltes physisches Paar darf nur EINMAL eingearbeitet
// werden. Zweite Bulk-/Reconcile-Aktion auf dasselbe Paar = deterministisches
// no-op ('already-reconciled'), NICHT generisches 'path-not-found'.
// MAIN-seitig: reconcileFolder. DISPATCH-seitig: reconcile-dispatch (Renderer-
// pure-Logik, kein Electron). ALLE Pfade temp via fixtures (os.tmpdir).
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { reconcileFolder, ALREADY_RECONCILED } from '../../src/main/services/reconcile-folder'
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

function opts(sb: ReturnType<typeof makeSandbox>) {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath }
}

// ── MAIN: reconcileFolder — Pflicht-Fall „gespiegeltes Paar zweimal" ─────────

test('F7 MAIN: gespiegeltes Paar zweimal -> zweite Aktion already-reconciled (kein path-not-found)', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-f7', { 'shared.md': 'TRUNK-V1' })
  const mirror = makeDir(sb.root, 'mirror-f7', { 'shared.md': 'MIRROR-V2' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'shared.md': 'adopt-mirror' }
  }

  // Erste Aktion: Mirror wird eingearbeitet + archiviert.
  const res1 = reconcileFolder(req, opts(sb))
  expect(res1.error).toBeNull()
  expect(res1.data!.partial).toBe(false)
  expect(res1.data!.mirrorArchivedTo).toBeTruthy()
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-V2')
  // Mirror ist nach Lauf 1 archiviert (Quell-Ordner weg).
  expect(existsSync(mirror)).toBe(false)

  // Zweite Aktion auf DASSELBE Paar: Mirror fehlt, Trunk steht ->
  // DETERMINISTISCH 'already-reconciled', NICHT 'path-not-found'.
  const res2 = reconcileFolder(req, opts(sb))
  expect(res2.error).toBe(ALREADY_RECONCILED)
  expect(res2.error).not.toBe('path-not-found')
  expect(res2.data).toBeNull()

  // Strukturelle „nur EINMAL"-Garantie: Trunk unveraendert, kein zweiter Touch.
  expect(readFileSync(join(trunk, 'shared.md'), 'utf8')).toBe('MIRROR-V2')
})

test('F7 MAIN: keep-trunk zweimal -> zweite Aktion already-reconciled, Trunk unberuehrt', () => {
  const sb = makeSandbox()
  const trunk = makeDir(sb.root, 'trunk-kt2', { 'a.md': 'A-TRUNK' })
  const mirror = makeDir(sb.root, 'mirror-kt2', { 'a.md': 'A-MIRROR' })

  const req: DirReconcileRequest = {
    trunkPath: trunk,
    mirrorPath: mirror,
    decisions: { 'a.md': 'keep-trunk' }
  }

  const res1 = reconcileFolder(req, opts(sb))
  expect(res1.error).toBeNull()
  expect(res1.data!.mirrorArchivedTo).toBeTruthy()
  expect(existsSync(mirror)).toBe(false)

  const res2 = reconcileFolder(req, opts(sb))
  expect(res2.error).toBe(ALREADY_RECONCILED)
  // Trunk nie mutiert (keep-trunk).
  expect(readFileSync(join(trunk, 'a.md'), 'utf8')).toBe('A-TRUNK')
})

test('F7 MAIN: BEIDE Pfade fehlen -> echtes path-not-found (nicht already-reconciled)', () => {
  const sb = makeSandbox()
  const req: DirReconcileRequest = {
    trunkPath: join(sb.root, 'kein-trunk'),
    mirrorPath: join(sb.root, 'kein-mirror'),
    decisions: {}
  }
  const res = reconcileFolder(req, opts(sb))
  expect(res.error).toBe('path-not-found')
  expect(res.error).not.toBe(ALREADY_RECONCILED)
})

test('F7 MAIN: leere Anfrage -> invalid-request (kein false-positive already-reconciled)', () => {
  const sb = makeSandbox()
  const res = reconcileFolder(
    { trunkPath: '', mirrorPath: '', decisions: {} } as DirReconcileRequest,
    opts(sb)
  )
  expect(res.error).toBe('invalid-request')
})

// ── DISPATCH: reconcile-dispatch (Renderer-pure, kein Electron) ──────────────

test('F7 DISPATCH: normalizePath vereinheitlicht Backslash/Trailing/Case', () => {
  expect(normalizePath('C:\\Users\\X\\.claude\\skills\\')).toBe('c:/users/x/.claude/skills')
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
