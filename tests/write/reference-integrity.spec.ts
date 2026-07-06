// reference-integrity.spec.ts -- rote Spezifikation fuer Move/Rename/Reconcile.
// Temp-Sandbox only: beweist, dass bekannte Referenzen beim aktuellen Stand
// nach Mutationen noch auf Altpfade zeigen. Keine Produktivpfade, keine Secrets.
import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { applyWrite } from '../../src/main/services/apply'
import { reconcileFolder } from '../../src/main/services/reconcile-folder'
import { moveEntryVersioned, renameEntry } from '../../src/main/services/rename-move'
import { reconcile } from '../../src/main/services/reconcile'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import type { Sandbox } from './fixtures'

interface DepEntry {
  canonical_source: string
  loader_path: string
}

function ctx(sb: Sandbox): { archiveRoot: string; auditPath: string; allowedRoots: string[] } {
  return { archiveRoot: sb.archiveRoot, auditPath: sb.auditPath, allowedRoots: [sb.configDir] }
}

function slash(path: string): string {
  return path.replace(/\\/g, '/')
}

function writeText(path: string, text: string): void {
  assertNotRealHome(path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

function readText(path: string): string {
  assertNotRealHome(path)
  return readFileSync(path, 'utf8')
}

function writeDeps(path: string, name: string, source: string): void {
  writeText(path, JSON.stringify({ skills: { [name]: {
    canonical_source: source,
    loader_path: source
  } } }, null, 2))
}

function readDep(path: string, name: string): DepEntry {
  const parsed = JSON.parse(readText(path)) as { skills: Record<string, DepEntry> }
  return parsed.skills[name]
}

test('moveEntryVersioned zieht governance-dependencies auf den Zielpfad nach', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'skills', 'code-quality', 'SKILL.md')
  const to = sandboxPath(sb, 'userglobal', 'skills', 'code-quality', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')
  writeText(from, '# Code Quality\n')
  writeDeps(deps, 'code-quality', from)

  const res = moveEntryVersioned({ version: 'shared', fromPath: from, to }, ctx(sb))

  expect(res.error).toBeNull()
  expect(existsSync(from)).toBe(false)
  expect(readText(to)).toBe('# Code Quality\n')
  expect(readDep(deps, 'code-quality').canonical_source).toBe(to)
  expect(readDep(deps, 'code-quality').loader_path).toBe(to)
})

test('renameEntry schreibt Wikilinks und Pfadstrings auf den neuen Namen um', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'agent-routing.md')
  const doc = sandboxPath(sb, 'docs', 'reference.md')
  const newPath = join(dirname(from), 'agent-routing-new.md')
  writeText(from, '# Agent Routing\n')
  writeText(doc, [
    'Siehe [[agent-routing]] fuer die Routing-Regel.',
    `Alter Pfad: ${slash(from)}`
  ].join('\n'))

  const res = renameEntry({
    sides: 'shared',
    newName: 'agent-routing-new.md',
    shared: { side: 'shared', path: from }
  }, ctx(sb))

  const after = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(newPath)).toBe(true)
  expect(after).toContain('[[agent-routing-new]]')
  expect(after).toContain(slash(newPath))
  expect(after).not.toContain('[[agent-routing]]')
  expect(after).not.toContain(slash(from))
})

test('applyWrite move darf Referenz-Integritaet nicht umgehen', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'skills', 'plugin-updater', 'SKILL.md')
  const to = sandboxPath(sb, 'userglobal', 'skills', 'plugin-updater', 'SKILL.md')
  const loader = sandboxPath(sb, 'skills', 'audit-agent-models', 'SKILL.md')
  writeText(from, '# Plugin Updater\n')
  writeText(loader, `CLAUDE_SKILL_DIR default: ${slash(from)}\n`)

  const res = applyWrite({ action: 'move', path: from, to, ownerMove: true }, ctx(sb))

  const after = readText(loader)
  expect(res.error).toBeNull()
  expect(existsSync(to)).toBe(true)
  expect(after).toContain(slash(to))
  expect(after).not.toContain(slash(from))
})

test('reconcile keep-trunk zieht Referenzen vom archivierten Mirror auf den Survivor nach', () => {
  const sb = makeSandbox()
  const trunk = sandboxPath(sb, 'shared', 'rules', 'cross-tool-paritaet.md')
  const mirror = sandboxPath(sb, 'userglobal', 'skills', 'cross-tool-paritaet', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')
  const doc = sandboxPath(sb, 'docs', 'surface.md')
  writeText(trunk, '# Cross Tool Paritaet\n')
  writeText(mirror, '# Cross Tool Paritaet mirror\n')
  writeDeps(deps, 'cross-tool-paritaet', mirror)
  writeText(doc, `Loader-Pfad: ${slash(mirror)}\n`)

  const res = reconcile({ trunkPath: trunk, mirrorPath: mirror, decision: 'keep-trunk' }, ctx(sb))

  const afterDoc = readText(doc)
  const afterDep = readDep(deps, 'cross-tool-paritaet')
  expect(res.error).toBeNull()
  expect(existsSync(mirror)).toBe(false)
  expect(afterDep.canonical_source).toBe(trunk)
  expect(afterDep.loader_path).toBe(trunk)
  expect(afterDoc).toContain(slash(trunk))
  expect(afterDoc).not.toContain(slash(mirror))
})

test('reconcileFolder keep-trunk zieht Referenzen vom Mirror-File auf den Trunk-Survivor nach', () => {
  const sb = makeSandbox()
  const trunkDir = sandboxPath(sb, 'shared', 'skills', 'routing')
  const mirrorDir = sandboxPath(sb, 'userglobal', 'skills', 'routing')
  const trunkFile = join(trunkDir, 'SKILL.md')
  const mirrorFile = join(mirrorDir, 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'folder-surface.md')
  writeText(trunkFile, '# Routing\n')
  writeText(mirrorFile, '# Routing mirror\n')
  writeText(doc, `Loader-Pfad: ${slash(mirrorFile)}\n`)

  const res = reconcileFolder({
    trunkPath: trunkDir,
    mirrorPath: mirrorDir,
    decisions: { 'SKILL.md': 'keep-trunk' }
  }, ctx(sb))

  const afterDoc = readText(doc)
  expect(res.error).toBeNull()
  expect(existsSync(mirrorDir)).toBe(false)
  expect(afterDoc).toContain(slash(trunkFile))
  expect(afterDoc).not.toContain(slash(mirrorFile))
})
