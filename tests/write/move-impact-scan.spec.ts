// move-impact-scan.spec.ts -- warn-only reference scan before move.
// Temp-sandbox only; no real home/shared/PM files are searched or mutated.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { scanMoveImpact } from '../../src/main/services/move-impact-scan'
import { makeSandbox, sandboxPath, assertNotRealHome } from './fixtures'

function writeText(path: string, text: string): void {
  assertNotRealHome(path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

test('findet governance-dependencies canonical_source und loader_path', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'skills', 'code-quality', 'SKILL.md')
  const to = sandboxPath(sb, 'skills-next', 'code-quality', 'SKILL.md')
  const deps = sandboxPath(sb, 'coordination', 'registry', 'governance-dependencies.json')
  writeText(from, '# Code Quality\n')
  writeText(deps, JSON.stringify({
    skills: {
      'code-quality': {
        canonical_source: from,
        loader_path: from
      }
    }
  }, null, 2))

  const res = scanMoveImpact({ version: 'shared', fromPath: from, to }, { scanRoots: [sb.configDir] })

  expect(res.error).toBeNull()
  expect(res.data!.findings.map((f) => f.field).sort()).toEqual(['canonical_source', 'loader_path'])
  expect(res.data!.findings.every((f) => f.kind === 'governance-dependency')).toBe(true)
})

test('findet Wikilink, Pfadstring und Loader-Default', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'agent-routing.md')
  const to = sandboxPath(sb, 'skills', 'agent-routing', 'SKILL.md')
  const doc = sandboxPath(sb, 'docs', 'reference.md')
  const slashPath = from.replace(/\\/g, '/')
  writeText(from, '# Agent Routing\n')
  writeText(doc, [
    'Siehe [[agent-routing]] fuer den bestehenden Anker.',
    `Alter Pfad: ${slashPath}`,
    `CLAUDE_SKILL_DIR default: ${slashPath}`
  ].join('\n'))

  const res = scanMoveImpact({ version: 'shared', fromPath: from, to }, { scanRoots: [sb.configDir] })
  const kinds = res.data!.findings.map((f) => f.kind)

  expect(res.error).toBeNull()
  expect(kinds).toContain('wikilink')
  expect(kinds).toContain('path')
  expect(kinds).toContain('loader-default')
})

test('ueberspringt Secret-Pfade ohne Inhalts-Read', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'cross-tool-paritaet.md')
  const to = sandboxPath(sb, 'skills', 'cross-tool-paritaet', 'SKILL.md')
  const secret = sandboxPath(sb, '.env')
  writeText(from, '# Cross Tool\n')
  writeText(secret, `SECRET_REF=${from}`)

  const res = scanMoveImpact({ version: 'shared', fromPath: from, to }, { scanRoots: [sb.configDir] })

  expect(res.error).toBeNull()
  expect(res.data!.findings).toHaveLength(0)
  expect(res.data!.skipped.secret).toBeGreaterThanOrEqual(1)
})

test('cleaner Sandbox-Stand liefert keine Treffer', () => {
  const sb = makeSandbox()
  const from = sandboxPath(sb, 'rules', 'plugin-updater.md')
  const to = sandboxPath(sb, 'skills', 'plugin-updater', 'SKILL.md')
  writeText(sandboxPath(sb, 'docs', 'neutral.md'), 'Keine Referenz auf den alten Ort.\n')

  const res = scanMoveImpact({ version: 'shared', fromPath: from, to }, { scanRoots: [sb.configDir] })

  expect(res.error).toBeNull()
  expect(res.data!.findings).toHaveLength(0)
  expect(res.data!.truncated).toBe(false)
})
