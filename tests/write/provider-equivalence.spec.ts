// provider-equivalence.spec.ts — Migrations-Gleichheits-Beweis (B-4).
// Fuer JEDEN der 4 Bestands-Anbieter wird bewiesen, dass die generische Engine
// (scanProvider(<id>Manifest)) gegen DIESELBE Sandbox die GLEICHEN categories
// erzeugt wie der Alt-Scanner (scanClaude/scanCodex/scanShared/scanLocalLlm).
// Vergleich: deep-equal auf categories (id/label/icon/path/blurb je Kategorie;
// id/name/status/scope/path/desc/updated/fields/searchKeys/code je Eintrag).
// duplicates/diffLabels/coverage sind dedupe-/coverage-Sache (nicht Scanner) und
// werden ausgeklammert.
//
// MECHANIK: Die Alt-Scanner binden ihren Basis-Pfad bei Modul-Load
// (`const claudeDir = configRoots().claudeHome`). Damit Alt-Scanner UND Engine
// gegen dieselbe Sandbox laufen, wird RAWALLM_SANDBOX_ROOT gesetzt, BEVOR die
// Scanner-/Manifest-/Engine-Module geladen werden, und der require-Cache des
// Scan-Subtrees vor jedem Provider verworfen (loadFresh). configRoots() liest
// Env pro Aufruf -> resolveRoots(manifest.roots) trifft dieselbe Sandbox.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Category, LlmConfig } from '../../shared/contract'
import type { ProviderManifest } from '../../shared/contract-provider'

// ── Fresh-Load-Harness ─────────────────────────────────────────────────────
// Alle Scan-/Manifest-/Engine-Module aus dem require-Cache werfen, damit ihre
// modul-gebundenen *Dir-Konstanten unter dem aktuellen RAWALLM_SANDBOX_ROOT neu
// aufgeloest werden. Grob ueber den Pfad-Praefix (Scan-Subtree + shared/services).
function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (
      k.includes('/src/main/scan/') ||
      k.includes('/src/main/services/config-roots') ||
      k.includes('/shared/contract')
    ) {
      delete require.cache[key]
    }
  }
}

// Ein Alt-Scanner + sein Manifest + die Engine frisch unter der gesetzten Env
// laden. Liefert beide Scan-Funktionen, gegen dieselbe Sandbox aufrufbar.
interface FreshPair {
  alt: () => LlmConfig
  manifest: ProviderManifest
  scanProvider: (m: ProviderManifest) => LlmConfig
}
function loadFresh(altModule: string, altExport: string, manifestModule: string, manifestExport: string): FreshPair {
  bustScanCache()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const alt = require(`../../src/main/scan/${altModule}`)[altExport] as () => LlmConfig
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const manifest = require(`../../src/main/scan/manifests/${manifestModule}`)[manifestExport] as ProviderManifest
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { scanProvider } = require('../../src/main/scan/engine/scan-engine') as {
    scanProvider: (m: ProviderManifest) => LlmConfig
  }
  return { alt, manifest, scanProvider }
}

// Sandbox-Wurzeln (Layout wie config-roots.sandboxRoots).
function sandboxRoots(root: string): { claude: string; codex: string; shared: string } {
  return {
    claude: join(root, '.claude'),
    codex: join(root, '.codex'),
    shared: join(root, '.shared', '.claude'),
  }
}

function w(file: string, content: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content, 'utf8')
}

// Markdown mit Frontmatter-description (deckt frontmatter-/raw-Parser ab).
function md(desc: string, title: string): string {
  return ['---', `description: ${desc}`, '---', `# ${title}`, '', 'Inhalt-Zeile.', ''].join('\n')
}

// Vergleich: nur categories. Sortierung NICHT angefasst (beide Pfade liefern
// dieselbe Reihenfolge). toEqual prueft tiefe Strukturgleichheit.
function expectSameCategories(a: Category[], b: Category[]): void {
  expect(b.map((c) => c.id)).toEqual(a.map((c) => c.id))
  expect(b).toEqual(a)
}

let sandboxRoot = ''
test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-equiv-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
})
test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  try {
    rmSync(sandboxRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// ── CLAUDE ──────────────────────────────────────────────────────────────────
test('claude: Engine-Manifest == scanClaude (deep-equal categories)', () => {
  const r = sandboxRoots(sandboxRoot).claude
  // skills/<skill>/SKILL.md
  w(join(r, 'skills', 'alpha', 'SKILL.md'), md('Alpha-Skill', 'Alpha'))
  // rules/*.md
  w(join(r, 'rules', 'one.md'), '# Regel Eins\n\nText.\n')
  // agents/*.md
  w(join(r, 'agents', 'bot.md'), md('Bot-Agent', 'Bot'))
  // settings.json (hooks + settings + maskierte Vorschau)
  w(join(r, 'settings.json'), JSON.stringify({
    permissions: { deny: ['a'], allow: ['b'] },
    env: { X: '1' },
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo' }] }] },
  }, null, 2))
  // hooks/*.cjs (Hook-Skript)
  w(join(r, 'hooks', 'guard.cjs'), '// hook\nmodule.exports = {}\n')
  // CLAUDE.md (instructions)
  w(join(r, 'CLAUDE.md'), '# Globale Instruktionen\n\nText.\n')
  // teams/<team>/config.json
  w(join(r, 'teams', 'crew', 'config.json'), JSON.stringify({ name: 'Crew', members: 2 }, null, 2))
  // plugins/installed_plugins.json + ein Plugin-Ordner
  w(join(r, 'plugins', 'installed_plugins.json'), JSON.stringify({
    plugins: { 'demo@market': [{ version: '1.0.0', scope: 'user', installedAt: '2026-06-01' }] },
  }, null, 2))
  w(join(r, 'plugins', 'extra', 'package.json'), JSON.stringify({ name: 'extra' }, null, 2))

  const { alt, manifest, scanProvider } = loadFresh('claude-scan', 'scanClaude', 'claude.manifest', 'claudeManifest')
  expectSameCategories(alt().categories, scanProvider(manifest).categories)
})

// ── CODEX ───────────────────────────────────────────────────────────────────
test('codex: Engine-Manifest == scanCodex (deep-equal categories)', () => {
  const r = sandboxRoots(sandboxRoot).codex
  // instructions: AGENTS.md + ein pm-*.toml (Whitelist)
  w(join(r, 'AGENTS.md'), '# Codex Startanker\n\nText.\n')
  w(join(r, 'pm-light.config.toml'), 'model = "x"\n')
  // settings: config.toml (secret-classed -> maskierte struct-preview)
  w(join(r, 'config.toml'), '[profile]\nmodel = "x"\napproval_policy = "y"\n')
  // hooks: hooks.json + hooks/*.cjs
  w(join(r, 'hooks.json'), JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ command: 'c' }] }] } }, null, 2))
  w(join(r, 'hooks', 'h.cjs'), '// h\n')
  // skills/<skill>/SKILL.md  (dir + drill)
  w(join(r, 'skills', 's1', 'SKILL.md'), md('Skill Eins', 'S1'))
  w(join(r, 'skills', 'loose.md'), md('Lose Skill-Datei', 'Loose'))
  // agents/<agent>/AGENT.md + _memory (muss uebersprungen werden)
  w(join(r, 'agents', 'a1', 'AGENT.md'), md('Agent Eins', 'A1'))
  w(join(r, 'agents', '_memory', 'note.md'), '# ignore\n')
  // rules/*.rules + *.md
  w(join(r, 'rules', 'r1.rules'), 'rule body\n')
  w(join(r, 'rules', 'r2.md'), md('Regel Zwei', 'R2'))
  // plugins/<plugin>/  (scanDirEntry, KEIN drill)
  w(join(r, 'plugins', 'p1', 'plugin.json'), JSON.stringify({ name: 'p1' }, null, 2))
  // teams/*.toml
  w(join(r, 'teams', 'team-a.toml'), 'name = "a"\n')

  const { alt, manifest, scanProvider } = loadFresh('codex-scan', 'scanCodex', 'codex.manifest', 'codexManifest')
  expectSameCategories(alt().categories, scanProvider(manifest).categories)
})

// ── SHARED ──────────────────────────────────────────────────────────────────
test('shared: Engine-Manifest == scanShared (deep-equal categories)', () => {
  const r = sandboxRoots(sandboxRoot).shared
  // A_CATEGORIES: agents/rules/skills/hooks/plugins/tools — je >= 1 Eintrag.
  w(join(r, 'agents', 'agent-x.md'), md('Agent X', 'AgentX'))
  w(join(r, 'rules', 'rule-x.md'), md('Rule X', 'RuleX'))
  w(join(r, 'skills', 'skill-x', 'SKILL.md'), md('Skill X', 'SkillX'))
  w(join(r, 'hooks', 'hook-x.cjs'), '// hook x\n')
  w(join(r, 'plugins', 'plug-x', 'plugin.json'), JSON.stringify({ name: 'plug-x' }, null, 2))
  // plugin-agent (haengt an agents-Karte via pluginAgentEntries)
  w(join(r, 'plugins', 'plug-x', 'agents', 'pa.md'), md('Plugin-Agent', 'PA'))
  w(join(r, 'tools', 'tool-x.md'), md('Tool X', 'ToolX'))
  // Instructions-Whitelist: CLAUDE.md / AGENTS.md
  w(join(r, 'CLAUDE.md'), '# Shared Instruktionen\n\nText.\n')
  w(join(r, 'AGENTS.md'), '# Shared AGENTS\n\nText.\n')
  // references/*
  w(join(r, 'references', 'ref-x.md'), md('Ref X', 'RefX'))
  // coordination/registry/*
  w(join(r, 'coordination', 'registry', 'workspaces.json'), JSON.stringify({ workspaces: {} }, null, 2))
  // coordination/<sub>/ Zaehler (mind. ein Sub mit Inhalt)
  w(join(r, 'coordination', 'briefings', 'b1.md'), '# b1\n')

  const { alt, manifest, scanProvider } = loadFresh('shared-scan', 'scanShared', 'shared.manifest', 'sharedManifest')
  expectSameCategories(alt().categories, scanProvider(manifest).categories)
})

// ── LLM (lokal) ─────────────────────────────────────────────────────────────
// Modellroots sind Env/Home, leichte externe Kandidaten und aktive local-
// Nutzerquellen. Alt-Scanner und Manifest rufen DIESELBEN Funktionen
// (scanGgufFiles/endpointEntries) gegen diese Roots — strukturell identisch.
// Fehlen alle Roots, macht scanLocalLlm einen comingSoon-Frueh-Return mit
// LEEREN categories (LlmConfig-Ebene, B-5/buildData-Sache).
test('llm: Engine-Manifest == scanLocalLlm (deep-equal categories, root-aware)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { existsSync } = require('node:fs') as typeof import('node:fs')
  const { alt, manifest, scanProvider } = loadFresh('llm-scan', 'scanLocalLlm', 'llm.manifest', 'llmManifest')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const llm = require('../../src/main/scan/llm-scan') as typeof import('../../src/main/scan/llm-scan')
  const engineCats = scanProvider(manifest).categories
  if (llm.ggufRoots().some((root) => existsSync(root))) {
    // Modellroot vorhanden -> Alt liefert exakt die beiden Kategorien.
    expectSameCategories(alt().categories, engineCats)
  } else {
    // Kein Root -> Alt macht comingSoon-Frueh-Return (leere categories). Die
    // Kategorie-Identitaet wird gegen die direkten Bestands-Funktionen bewiesen.
    expect(alt().categories).toEqual([])
    expect(engineCats.map((c) => c.id)).toEqual(['gguf-models', 'llm-endpoints'])
    expect(engineCats[0].entries).toEqual(llm.scanGgufFiles())
    expect(engineCats[1].entries).toEqual(llm.endpointEntries())
  }
})
