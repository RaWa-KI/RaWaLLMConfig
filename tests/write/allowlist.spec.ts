// allowlist.spec.ts — HARTE Wurzel-Allowlist im Main (P0-2). edit/add/move mit
// Ziel ausserhalb allowedRoots -> 'out-of-scope', KEIN Write. move mit erlaubter
// Quelle, aber Out-of-scope-Ziel -> reject. Reine temp-Sandbox.
import { test, expect } from '@playwright/test'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { applyWrite } from '../../src/main/services/apply'
import { assertInScope, OUT_OF_SCOPE_REASON } from '../../src/main/services/path-scope'
import { makeSandbox, seedFile, sandboxPath } from './fixtures'
import type { Sandbox } from './fixtures'

// opts mit Sandbox-configDir als einziger erlaubter Wurzel.
function scopedOpts(sb: Sandbox): { archiveRoot: string; auditPath: string; allowedRoots: string[] } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

test('assertInScope: segment-sicher (kein startsWith-Praefix-Trick)', () => {
  const root = '/home/u/.claude'
  expect(assertInScope('/home/u/.claude/rules/x.md', [root]).writable).toBe(true)
  // /home/u/.claude-evil darf NICHT als unter /home/u/.claude gelten.
  expect(assertInScope('/home/u/.claude-evil/x.md', [root]).writable).toBe(false)
  // Wurzel selbst ist kein Datei-Ziel.
  expect(assertInScope(root, [root]).writable).toBe(false)
  // Leere Allowlist -> fail-closed.
  expect(assertInScope('/home/u/.claude/x.md', []).reason).toBe(OUT_OF_SCOPE_REASON)
})

test('edit mit Ziel ausserhalb allowedRoots -> out-of-scope, kein Write', () => {
  const sb = makeSandbox()
  // Datei liegt in der Sandbox-root (NICHT unter configDir = allowedRoot).
  const outside = join(sb.root, 'fremd.md')
  seedFile({ ...sb, configDir: sb.root }, 'fremd.md', 'ORIG')
  const res = applyWrite({ action: 'edit', path: outside, content: 'NEU' }, scopedOpts(sb))
  expect(res.error).toBe(OUT_OF_SCOPE_REASON)
  expect(readFileSync(outside, 'utf8')).toBe('ORIG') // unveraendert
})

test('add mit Ziel ausserhalb allowedRoots -> out-of-scope, kein Write', () => {
  const sb = makeSandbox()
  const outside = join(sb.root, 'neu-aussen.md')
  const res = applyWrite({ action: 'add', path: outside, content: 'X' }, scopedOpts(sb))
  expect(res.error).toBe(OUT_OF_SCOPE_REASON)
  expect(existsSync(outside)).toBe(false)
})

test('move ohne ownerMove: Out-of-scope-Ziel -> reject, Quelle bleibt (rueckwaertskompatibel)', () => {
  const sb = makeSandbox()
  const src = seedFile(sb, 'q.md', 'Q') // in configDir (allowed)
  const toOutside = join(sb.root, 'ziel-aussen.md') // ausserhalb allowedRoot
  // Ohne ownerMove bleibt das Ziel gescopet (Default = altes Verhalten).
  const res = applyWrite({ action: 'move', path: src, to: toOutside }, scopedOpts(sb))
  expect(res.error).toBe(OUT_OF_SCOPE_REASON)
  expect(existsSync(src)).toBe(true) // Quelle NICHT verschoben
  expect(existsSync(toOutside)).toBe(false)
})

test('move mit ownerMove: Out-of-scope-Ziel ist erlaubt (Finding A), Quell-Scope bleibt hart', () => {
  const sb = makeSandbox()
  const src = seedFile(sb, 'q2.md', 'Q2') // in configDir (allowed Quelle)
  const toOutside = join(sb.root, 'ziel-aussen2.md') // ausserhalb allowedRoot
  // ownerMove=true -> das frei gewaehlte Ziel wird NICHT gegen die Allowlist geprueft.
  const res = applyWrite(
    { action: 'move', path: src, to: toOutside, ownerMove: true },
    scopedOpts(sb)
  )
  expect(res.error).toBeNull()
  expect(existsSync(src)).toBe(false) // Quelle verschoben
  expect(readFileSync(toOutside, 'utf8')).toBe('Q2')
})

test('move mit ownerMove: out-of-scope QUELLE bleibt geblockt (Quell-Scope hart)', () => {
  const sb = makeSandbox()
  // Quelle liegt ausserhalb allowedRoot -> Quell-Scope-Check verweigert trotz ownerMove.
  const srcOutside = join(sb.root, 'fremd-src.md')
  seedFile({ ...sb, configDir: sb.root }, 'fremd-src.md', 'SRC')
  const toInside = sandboxPath(sb, 'ziel.md') // in configDir
  const res = applyWrite(
    { action: 'move', path: srcOutside, to: toInside, ownerMove: true },
    scopedOpts(sb)
  )
  expect(res.error).toBe(OUT_OF_SCOPE_REASON)
  expect(existsSync(srcOutside)).toBe(true) // Quelle unangetastet
})

test('In-Scope-Write (unter allowedRoot) bleibt erlaubt', () => {
  const sb = makeSandbox()
  const target = sandboxPath(sb, 'ok.md') // unter configDir
  const res = applyWrite({ action: 'add', path: target, content: 'OK' }, scopedOpts(sb))
  expect(res.error).toBeNull()
  expect(readFileSync(target, 'utf8')).toBe('OK')
})

test('move mit relativem Ziel -> MOVE_TARGET_NOT_ABSOLUTE, kein Write', () => {
  const sb = makeSandbox()
  const src = seedFile(sb, 'rel.md', 'REL') // in configDir (allowed Quelle)
  // Relatives Ziel wuerde gegen das CWD des Main-Prozesses aufgeloest -> falsches/
  // unvorhersehbares Ziel (Move-Datenverlust). doMove lehnt VOR jeder Mutation ab.
  // ownerMove=true: Ziel-Allowlist ist umgangen, daher ist der Absolut-Check der
  // load-bearing Guard (nicht out-of-scope).
  const res = applyWrite({ action: 'move', path: src, to: 'rel-ziel.md', ownerMove: true }, scopedOpts(sb))
  expect(res.error).toBe('MOVE_TARGET_NOT_ABSOLUTE')
  expect(existsSync(src)).toBe(true) // Quelle unangetastet
})
