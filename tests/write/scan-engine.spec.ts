// scan-engine.spec.ts — Engine-Unit-Test (B-3). Ein synthetisches Manifest
// (eine dir-Kategorie + eine file-Kategorie + ein endpoint) gegen eine kleine
// Temp-Fixture. Assertion: die Engine liefert die erwarteten Kategorien mit
// erwarteten ids/Reihenfolge/fields. Runner: Playwright (test/expect) als reiner
// Node-Test-Runner (kein Browser, keine neue Dependency). Secret-frei: die
// Fixture enthaelt nur unkritische Markdown-/Text-Inhalte.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ProviderManifest } from '../../shared/contract-provider'
import { scanProvider } from '../../src/main/scan/engine/scan-engine'

// Temp-Fixture: <root>/skills/<skill>/SKILL.md (dir-Kategorie) + <root>/rules/
// *.md (file-Kategorie). Secret-frei. Gibt die Wurzel (fixedRoot) zurueck.
function seedFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-engine-'))
  // dir-Kategorie 'skills': zwei Skill-Ordner mit SKILL.md (Frontmatter-desc).
  for (const nm of ['alpha-skill', 'beta-skill']) {
    const dir = join(root, 'skills', nm)
    mkdirSync(dir, { recursive: true })
    const fm = ['---', `description: Desc fuer ${nm}`, '---', `# ${nm}`, 'Inhalt.', ''].join('\n')
    writeFileSync(join(dir, 'SKILL.md'), fm, 'utf8')
  }
  // file-Kategorie 'rules': zwei .md-Dateien (raw-preview).
  const rulesDir = join(root, 'rules')
  mkdirSync(rulesDir, { recursive: true })
  writeFileSync(join(rulesDir, 'one.md'), '# Regel Eins\n\nText eins.\n', 'utf8')
  writeFileSync(join(rulesDir, 'two.md'), '# Regel Zwei\n\nText zwei.\n', 'utf8')
  return root
}

// Synthetisches Manifest: fixedRoot (config-roots-unabhaengig) zeigt direkt auf
// die Temp-Fixture; resolveRoots() nimmt fixedRoot wie llm-scan GGUF_ROOT.
function makeManifest(root: string): ProviderManifest {
  return {
    id: 'test',
    label: 'Test-Provider',
    roots: [{ rootKey: 'projectRoot', fixedRoot: root }],
    categories: [
      {
        id: 'skills', idPrefix: 'test-skills', label: 'Skills', icon: 'skill',
        blurb: 'Test-Skills', subdir: 'skills', scan: 'dir', parser: 'frontmatter',
        withContent: true, desc: 'Test-Skill',
      },
      {
        id: 'rules', idPrefix: 'test-rules', label: 'Rules', icon: 'rule',
        blurb: 'Test-Rules', subdir: 'rules', glob: '*.md', scan: 'file',
        parser: 'raw-preview', withContent: true, desc: 'Test-Rule',
      },
    ],
    endpoints: [
      {
        id: 'test-endpoint-9000', label: 'test-endpoint',
        url: 'http://127.0.0.1:9000/v1', host: '127.0.0.1', port: '9000',
        desc: 'Test-Endpoint', updated: '2026-06-16', status: 'stale',
        fields: { Port: '9000', API: 'OpenAI /v1' },
      },
    ],
    capabilities: ['secret-guarded'],
  }
}

test('Engine liefert Kategorien in Manifest-Reihenfolge + Endpoint-Kategorie', () => {
  const root = seedFixture()
  const cfg = scanProvider(makeManifest(root))
  // Reihenfolge: skills, rules, dann die angehaengte Endpoint-Kategorie.
  expect(cfg.categories.map((c) => c.id)).toEqual(['skills', 'rules', 'test-endpoints'])
  expect(cfg.duplicates).toEqual([])
})

test('dir-Kategorie: Drill-ids = ${idPrefix}-${ordnername}, alphabetisch gelistet', () => {
  const root = seedFixture()
  const cfg = scanProvider(makeManifest(root))
  const skills = cfg.categories.find((c) => c.id === 'skills')!
  // listDir liefert Ordner in readdir-Reihenfolge (alpha vor beta in der Fixture).
  expect(skills.entries.map((e) => e.id)).toEqual(['test-skills-alpha-skill', 'test-skills-beta-skill'])
  // Frontmatter-desc wurde uebernommen (parser frontmatter).
  expect(skills.entries[0].desc).toBe('Desc fuer alpha-skill')
  // Drill zeigt auf die Definitionsdatei (Ordner-Eintrag via scanDirEntry).
  expect(skills.entries[0].name).toBe('alpha-skill')
})

test('file-Kategorie: ids = ${idPrefix}-${dateiname} (slugified), Glob *.md greift', () => {
  const root = seedFixture()
  const cfg = scanProvider(makeManifest(root))
  const rules = cfg.categories.find((c) => c.id === 'rules')!
  expect(rules.entries.map((e) => e.id)).toEqual(['test-rules-one-md', 'test-rules-two-md'])
  // raw-preview-desc = erste H1 aus der Vorschau.
  expect(rules.entries[0].desc).toBe('Regel Eins')
  expect(rules.entries[0].name).toBe('one.md')
})

test('endpoint-Kategorie: id/name/path aus EndpointSpec, fields durchgereicht', () => {
  const root = seedFixture()
  const cfg = scanProvider(makeManifest(root))
  const eps = cfg.categories.find((c) => c.id === 'test-endpoints')!
  expect(eps.entries).toHaveLength(1)
  const e = eps.entries[0]
  expect(e.id).toBe('test-endpoint-9000')
  expect(e.name).toBe('test-endpoint')
  expect(e.path).toBe('http://127.0.0.1:9000/v1')
  expect(e.scope).toBe('local')
  expect(e.status).toBe('stale')
  expect(e.fields).toEqual({ Port: '9000', API: 'OpenAI /v1' })
})
