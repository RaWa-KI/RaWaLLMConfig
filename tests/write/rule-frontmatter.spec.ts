import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanClaude } from '../../src/main/scan/claude-scan'
import { scanCodex } from '../../src/main/scan/codex-scan'

// Statischer Import statt require + Cache-Bust: claude-scan/codex-scan loesen
// claudeDir/codexDir bei JEDEM Aufruf ueber configRoots() auf (reine Funktion
// von RAWALLM_SANDBOX_ROOT) — das gesetzte Env genuegt.

test('claude rule scan exposes paths/globs and flags ignored globs', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-rule-fm-'))
  process.env.RAWALLM_SANDBOX_ROOT = root
  try {
    const rules = join(root, '.claude', 'rules')
    mkdirSync(rules, { recursive: true })
    writeFileSync(join(rules, 'always.md'), '---\ndescription: Always\n---\n# Always\n', 'utf8')
    writeFileSync(join(rules, 'scoped.md'), '---\npaths: "**/*.ts"\n---\n# Scoped\n', 'utf8')
    writeFileSync(join(rules, 'legacy.md'), '---\nglobs: "**/*.ts"\n---\n# Legacy\n', 'utf8')
    writeFileSync(join(root, '.claude', 'settings.json'), '{}', 'utf8')
    const cat = scanClaude().categories.find((c) => c.id === 'rules')!
    const scoped = cat.entries.find((e) => e.name === 'scoped')!
    const legacy = cat.entries.find((e) => e.name === 'legacy')!
    expect(scoped.fields?.paths).toBe('**/*.ts')
    expect(legacy.fields?.globs).toBe('**/*.ts')
    expect(legacy.fields?.['Frontmatter-Hinweis']).toContain('Nutze paths')
    expect(legacy.status).toBe('conflict')
    expect(legacy.conflictReason).toContain('globs')
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
  }
})

test('codex skill scan exposes schema hints, load mode and token estimate', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-codex-fm-'))
  process.env.RAWALLM_SANDBOX_ROOT = root
  try {
    const skill = join(root, '.codex', 'skills', 'demo')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: demo\ndescription: Demo skill\nglobs: "**/*.ts"\n---\n# Demo\n',
      'utf8',
    )
    const cat = scanCodex().categories.find((c) => c.id === 'codex-skills')!
    const entry = cat.entries.find((e) => e.name === 'demo')!
    expect(entry.loadMode).toBe('bei-bedarf')
    expect(entry.tokensEstimated).toBeGreaterThan(0)
    expect(entry.fields?.['Frontmatter-Hinweis']).toContain('globs')
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
  }
})
