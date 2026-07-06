// scanner-c04.spec.ts — C-04 Batch 3.3 isolierte Scanner A1-1/A1-2/A1-5.
// Temp-Sandbox only; keine echten Shared-/Registry-/Userglobal-Pfade.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { scanAllWikilinks } from '../../src/main/scan/reference-sweep'
import { auditRegistryPaths } from '../../src/main/scan/registry-audit'
import { crosscheckHooks } from '../../src/main/scan/hook-crosscheck'
import { assertNotRealHome, makeSandbox, sandboxPath } from './fixtures'
import type { Sandbox } from './fixtures'

function writeText(path: string, text: string): string {
  assertNotRealHome(path)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
  return path
}

test('A1-1 scanAllWikilinks: kaputtes [[nicht-existent]] liefert genau 1 Finding', () => {
  const sb = makeSandbox()
  writeText(sandboxPath(sb, 'docs', 'vorhanden.md'), '# Vorhanden\n')
  const doc = writeText(
    sandboxPath(sb, 'docs', 'index.md'),
    ['Siehe [[vorhanden]].', 'Kaputt: [[nicht-existent]].'].join('\n'),
  )

  const findings = scanAllWikilinks([sb.configDir])

  expect(findings).toEqual([{
    kind: 'dead-wikilink',
    filePath: doc,
    line: 2,
    target: 'nicht-existent',
    reason: 'target-not-found',
  }])
})

test('A1-2 auditRegistryPaths: tote absolute Registry-Pfade werden gemeldet', () => {
  const sb = makeSandbox()
  const existing = writeText(sandboxPath(sb, 'live', 'SKILL.md'), '# live\n')
  const missing = sandboxPath(sb, 'missing', 'SKILL.md')
  const workspaces = writeText(sandboxPath(sb, 'registry', 'workspaces.json'), JSON.stringify({
    workspaces: {
      ok: { path_local: sb.configDir },
      broken: { path_local: missing },
    },
  }))
  const deps = writeText(sandboxPath(sb, 'registry', 'governance-dependencies.json'), JSON.stringify({
    skills: {
      live: { canonical_source: existing, loader_path: existing },
      dead: { canonical_source: missing, loader_path: existing },
    },
  }))

  const findings = auditRegistryPaths({ workspacesJsonPath: workspaces, governanceDependenciesPath: deps })

  expect(findings).toEqual([
    { kind: 'registry-drift', wsKey: 'broken', path: missing, field: 'path_local', reason: 'absolute-path-missing' },
    { kind: 'registry-drift', wsKey: 'skills.dead', path: missing, field: 'canonical_source', reason: 'absolute-path-missing' },
  ])
})

test('A1-5 crosscheckHooks: missing command und unregistriertes Script sichtbar', () => {
  const sb: Sandbox = makeSandbox()
  const hookDir = sandboxPath(sb, 'hooks')
  const registered = writeText(join(hookDir, 'registered.cjs'), 'console.log("ok")\n')
  const unregistered = writeText(join(hookDir, 'unregistered.cjs'), 'console.log("unused")\n')
  const missing = sandboxPath(sb, 'hooks', 'missing.cjs')
  const settings = writeText(sandboxPath(sb, 'settings.json'), JSON.stringify({
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: `node "${registered}"` }] },
        { hooks: [{ type: 'command', command: `node "${missing}"` }] },
      ],
    },
  }))

  const findings = crosscheckHooks({ registrationFiles: [settings], hookDirs: [hookDir] })

  expect(findings).toEqual([
    {
      kind: 'orphan-registration',
      filePath: settings,
      command: `node "${missing}"`,
      commandPath: missing,
      reason: 'command-path-missing',
    },
    { kind: 'orphan-script', filePath: unregistered, reason: 'script-not-registered' },
  ])
})
