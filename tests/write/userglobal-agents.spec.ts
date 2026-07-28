// userglobal-agents.spec.ts — WP2 Drift-Relation: Kimi-Loader-Root ~/.agents
// als dritter Userglobal-Root (Praefix 'userglobal-agents-', HR16-Paritaet).
// Belegt: (a) normalizeCat strippt 'userglobal-agents-' auf die Kategorie-Achse;
// (b) ein Fixture-Baum <sandbox>/.agents/skills/<name>/SKILL.md landet als
// Kategorie 'userglobal-agents-skills' im buildUserglobal-Scan; (c) fehlender
// Root ist tolerant (keine Kategorie, kein Fehler).
// ALLE Pfade liegen in einer temp-Sandbox (RAWALLM_SANDBOX_ROOT), NIE real.
import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeCat } from '../../shared/cat-key'
import { buildUserglobal } from '../../src/main/scan/scan-index'
import { makeSandbox, assertNotRealHome } from './fixtures'
import type { Sandbox } from './fixtures'

// Env fuer einen Test setzen und garantiert restaurieren.
function withSandboxRoot<T>(sb: Sandbox, fn: () => T): T {
  const old = process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = sb.root
  try {
    return fn()
  } finally {
    if (old === undefined) delete process.env.RAWALLM_SANDBOX_ROOT
    else process.env.RAWALLM_SANDBOX_ROOT = old
  }
}

// Fixture: <sandbox>/.agents/skills/<name>/SKILL.md anlegen.
function seedAgentsSkill(sb: Sandbox, name: string): string {
  const dir = join(sb.root, '.agents', 'skills', name)
  assertNotRealHome(dir)
  mkdirSync(dir, { recursive: true })
  const fp = join(dir, 'SKILL.md')
  writeFileSync(fp, `---\ndescription: Dummy ${name}\n---\n# ${name}\n`, 'utf8')
  return fp
}

test('normalizeCat strippt userglobal-agents- auf die gemeinsame Achse', () => {
  expect(normalizeCat('userglobal-agents-skills')).toBe('skills')
  // Bestehende Praefixe bleiben unveraendert.
  expect(normalizeCat('userglobal-claude-skills')).toBe('skills')
  expect(normalizeCat('userglobal-codex-skills')).toBe('skills')
})

test('~/.agents/skills/<name> landet als Kategorie userglobal-agents-skills im Scan', () => {
  const sb = makeSandbox()
  const skillPath = seedAgentsSkill(sb, 'parity-skill')
  const userglobal = withSandboxRoot(sb, () => buildUserglobal({}))
  const cat = userglobal.categories.find((c) => c.id === 'userglobal-agents-skills')
  expect(cat).toBeDefined()
  expect(cat!.entries).toHaveLength(1)
  expect(cat!.entries[0].name).toBe('parity-skill')
  expect(cat!.entries[0].path).toBe(skillPath)
  expect(cat!.entries[0].scope).toBe('global')
  expect(cat!.entries[0].fields?.Werkzeug).toBe('Kimi')
})

test('fehlender ~/.agents-Root ist tolerant (keine Kategorie, kein Fehler)', () => {
  const sb = makeSandbox()
  const userglobal = withSandboxRoot(sb, () => buildUserglobal({}))
  expect(userglobal.categories.find((c) => c.id === 'userglobal-agents-skills')).toBeUndefined()
})
