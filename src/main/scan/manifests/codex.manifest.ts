// codex.manifest.ts — datengetriebenes Manifest fuer ~/.codex (B-4).
// DEKLARATIV (CategorySpec, scan:'dir') sind skills/agents/rules/plugins/teams:
// scanDir mischt Ordner (scanDirEntry) + Dateien (fileEntry) in EINE Kategorie;
// die Engine-runDirCategory tut exakt dasselbe (gleicher Helfer, gleicher
// idPrefix `codex-${sub}`, gleiche slugifizierte ids). parser bleibt 'frontmatter'
// (fuer dir-Kategorien irrelevant; nur 'json-keys' wuerde drillen — das tut
// scanDir NICHT, also bewusst vermieden).
// CUSTOM (CategorySpec NICHT 1:1) sind instructions/settings/hooks: bespoke
// Whitelist-Regex (AGENTS|CLAUDE_PARITY|CODEX + pm-/profile-toml, WS-AGENTS.md),
// strukturierte config.toml-/hooks.json-Einzeldatei-Logik mit maskierter Vorschau
// + searchKeys. Diese wrappen scanInstructions/scanSettings/scanHooks (FERTIGE
// Category). Reihenfolge = scanCodex: instructions, settings, hooks, skills,
// agents, rules, plugins, teams.
import type { Category } from '@shared/contract'
import type { CategorySpec, CustomCategory, ProviderManifest } from '@shared/contract-provider'
import { diffLabels } from '@shared/dup-labels'
import { scanInstructions, scanSettings, scanHooks, codexDir } from '../codex-scan'

// Deklarative dir-Kategorie nach scanDir-Vorbild. scan:'dir' => Engine nutzt
// scanDirEntry (Ordner) + fileEntry (Dateien), genau wie scanDir. parser nur als
// Pflichtfeld (dir-Pfad ignoriert ihn, ausser 'json-keys' -> Drill; nie hier).
function dirSpec(
  sub: string,
  label: string,
  icon: string,
  desc: string,
  withContent: boolean,
): CategorySpec {
  return {
    id: `codex-${sub}`,
    idPrefix: `codex-${sub}`,
    label,
    icon,
    blurb: `codexDir/${sub}/*`,
    subdir: sub,
    scan: 'dir',
    parser: 'frontmatter',
    withContent,
    desc,
  }
}

// CustomCategory aus einer bespoke scanX()-Funktion (liefert FERTIGE Category).
// Die bespoke Funktion bindet ihren codexDir modulintern (configRoots()), exakt
// wie der Bestands-scanCodex — base/manifest werden bewusst ignoriert (im
// Equivalence-Test ist base === codexDir, sandbox-aware identisch).
function customFrom(build: () => Category): CustomCategory {
  return { custom: () => build() }
}

export const codexManifest: ProviderManifest = {
  id: 'codex',
  label: 'Codex',
  roots: [{ rootKey: 'codexHome' }],
  capabilities: ['secret-guarded'],
  // Bestands-DiffLabels: scanCodex setzt diffLabels('codex') (CODEX_DIFF_LABELS).
  diffLabels: diffLabels('codex'),
  categories: [
    customFrom(scanInstructions),
    customFrom(scanSettings),
    customFrom(scanHooks),
    dirSpec('skills', 'Skills', 'skill', 'Codex-Skill', true),
    dirSpec('agents', 'Agents', 'agent', 'Codex-Agent-Definition', true),
    // W8-Fix rules: .rules-Dateien via fileEntry (.rules-Regex in fileEntry).
    dirSpec('rules', 'Rules', 'rule', 'Codex-Rule', true),
    dirSpec('plugins', 'Plugins', 'plug', 'Codex-Plugin', false),
    // W6-Fix: Teams-Kategorie (~/.codex/teams/*.toml).
    dirSpec('teams', 'Teams', 'team', 'Codex-Team-Konfiguration', true),
  ],
}

// Lesbarkeits-Anker fuer den Equivalence-Test (Bestands-codexDir).
export const codexManifestRoot = codexDir
