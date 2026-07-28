// load-classifier-selectivity.spec.ts (WP-9/B12 Kontextbudget-Wahrheit)
// Belegt: der Scanner-LoadMode bewertet den paths-WERT (nicht nur die Existenz),
// unterscheidet userglobal vs. Workspace bei CLAUDE.md/AGENTS.md, und die
// LoadInfoLine laesst die feinere Semantik (classifyLoad) ueber den groben
// Scanner-loadMode gewinnen (vor dem Fix war classifyLoad ein toter else-Zweig,
// weil der Scanner loadMode immer setzt — scan-entry.ts -> decorateConfigEntry).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { classifyLoadMode } from '../../src/main/scan/load-classifier'
import { classifyLoad, resolveLoadHint } from '../../src/renderer/sections/compare/load-semantics'

const RULE = 'C:/Users/u/.claude/rules/demo.md'
const GLOBAL_CLAUDE_MD = 'C:/Users/u/.claude/CLAUDE.md'
const WORKSPACE_CLAUDE_MD = 'C:/Users/u/Desktop/Projekte/RaWaLLMConfig/CLAUDE.md'

test('paths-Wert entscheidet: Alles-Glob zaehlt als immer, enger Glob als bedingt', () => {
  expect(classifyLoadMode(RULE, { paths: '**/*' })).toBe('immer')
  expect(classifyLoadMode(RULE, { paths: '*.ts, *.md' })).toBe('immer')
  expect(classifyLoadMode(RULE, { paths: 'src/**/*.ts' })).toBe('bedingt')
  expect(classifyLoadMode(RULE, { paths: '**/*.ts' })).toBe('bedingt')
})

test('nur userglobale CLAUDE.md/AGENTS.md laden bei jedem Start', () => {
  expect(classifyLoadMode(GLOBAL_CLAUDE_MD)).toBe('immer')
  expect(classifyLoadMode('~/.claude/CLAUDE.md')).toBe('immer')
  expect(classifyLoadMode('/home/u/.codex/AGENTS.md', undefined, 'generic', 'linux')).toBe('immer')
  expect(classifyLoadMode('C:/Users/u/.kimi-code/AGENTS.md')).toBe('immer')
  expect(classifyLoadMode(WORKSPACE_CLAUDE_MD)).toBe('bedingt')
  expect(classifyLoadMode('C:/Workspace/Project/AGENTS.md')).toBe('bedingt')
})

test('resolveLoadHint: feinere Semantik schlaegt groben Scanner-loadMode', () => {
  expect(resolveLoadHint(WORKSPACE_CLAUDE_MD, undefined, undefined, 'immer').when).toBe('beim Arbeiten hier')
  expect(resolveLoadHint(GLOBAL_CLAUDE_MD, '~/.claude', undefined, 'immer').when).toBe('immer')
  expect(resolveLoadHint(WORKSPACE_CLAUDE_MD, undefined, undefined, 'bedingt').when).toBe('beim Arbeiten hier')
  // Nicht doc-belegter Fallback korrigiert den Scanner nie:
  expect(resolveLoadHint('C:/Users/u/.codex/config.toml', undefined, undefined, 'immer').source).toBe('Scanner loadMode')
  // 'unbekannt' zaehlt nicht als Scanner-Wahrheit:
  expect(resolveLoadHint('C:/Users/u/.claude/MEMORY.md', undefined, undefined, 'unbekannt').when).toBe('immer')
  // Fehlender loadMode -> reine Semantik (bisheriger else-Zweig):
  expect(resolveLoadHint(RULE, '~/.claude', { paths: 'src/**/*.ts' }).when).toBe('bedingt')
})

test('classifyLoad bewertet breite Rule-paths ebenfalls als immer', () => {
  expect(classifyLoad(RULE, '~/.claude', { paths: '**/*' }).when).toBe('immer')
  expect(classifyLoad(RULE, '~/.claude', { paths: 'src/**/*.ts' }).when).toBe('bedingt')
})

// Owner-Auflage WP-9: Todes-Schaltung der LoadInfoLine per Source-Pin belegen
// (Muster drawer-first-click.spec.ts). Vor dem Fix stand dort
// `loadMode ? hintFromLoadMode(loadMode) : classifyLoad(...)` — classifyLoad war
// tot, weil der Scanner loadMode immer setzt. Nach dem Fix muss die Zeile die
// Prioritaetsregel resolveLoadHint nutzen (Semantik gewinnt, wo sie feiner ist).
test('Source-Pin: LoadInfoLine nutzt die Prioritaetsregel statt loadMode-first', () => {
  const src = readFileSync(join(process.cwd(), 'src/renderer/sections/config/LoadInfoLine.tsx'), 'utf8')
  expect(src).toContain('resolveLoadHint(path, origin, fields, loadMode)')
  expect(src).not.toContain('loadMode ? hintFromLoadMode')
})
