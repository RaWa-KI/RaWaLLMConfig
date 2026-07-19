// move-target.spec.ts — Cross-Family-Ziel-Aufloesung des Verschieben-Dialogs.
// Reine Pure-Funktionen im Node-Sandbox-Runner: kein Renderer-DOM, kein fs, keine
// fixtures. Sichert die Regression aus dem Cross-Family-Move (z.B. Claude -> Shared):
// buildKnownPaths sammelt ueber ALLE Familien, sonst liefert resolveFamilyRoot fuer
// die ZIEL-Familie undefined -> leeres Ziel -> Move scheitert/verliert (No-Data-Loss).
// Stil exakt wie import-targets.spec.ts / dedupe-cat.spec.ts. Inhalte sind Dummy.
import { test, expect } from '@playwright/test'
import { buildKnownPaths } from '../../src/renderer/sections/config/known-paths'
import {
  buildQuickPath,
  endsOnFolder,
  ensureFileTarget,
  isAbsolutePath,
  lastSegment,
  resolveFamilyRoot,
} from '../../src/renderer/sections/config/move-target'
import type { AppData, ConfigEntry, Category, LlmConfig, Snapshot, Machine, LlmDef } from '../../shared/contract'

// Reale, absolute Familien-Wurzeln (Windows-Laufwerk, wie im echten knownPaths
// dieses WS; isAbsolutePath akzeptiert C:/…). Separator-tolerant geprueft.
const CLAUDE_ROOT = 'C:/Users/u/.claude'
const CODEX_ROOT = 'C:/Users/u/.codex'
const SHARED_TRUNK = 'C:/Users/u/Desktop/Projekte/.shared/.claude'

// Minimal-Entry mit absolutem Pfad (alle ConfigEntry-Pflichtfelder, contract.ts:13).
function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-06-09' }
}

// Eine Kategorie (alle Category-Pflichtfelder, contract.ts:42). catPath = Kategorie-Root.
function mkCat(id: string, catPath: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: catPath, blurb: '', entries }
}

// Minimal-AppData (Shape contract.ts:224-229): snapshot/machines/llms als Dummy,
// nur `data` befuellt — buildKnownPaths/resolveFamilyRoot lesen ausschliesslich `data`.
function mkAppData(data: Record<string, LlmConfig>): AppData {
  const snapshot: Snapshot = { frozen: false, date: '2026-06-09', label: 'test' }
  const machines: Machine[] = []
  const llms: LlmDef[] = []
  return { snapshot, machines, llms, data }
}

// Multi-Familien-AppData mit absoluten Pfaden: claude (Kategorie rules + Eintrag),
// codex (Eintrag), shared (Eintrag im .shared/.claude-Trunk). Die ZIEL-Familien-Wurzeln
// (codex/shared) stehen NUR ueber ihre Eintrags-/Kategorie-Pfade in den knownPaths —
// genau das muss buildKnownPaths familienuebergreifend einsammeln.
function multiFamily(): AppData {
  return mkAppData({
    claude: {
      categories: [
        mkCat('rules', CLAUDE_ROOT + '/rules', [mkEntry('rules-r', 'rules-r.md', CLAUDE_ROOT + '/rules/rules-r.md')]),
      ],
      duplicates: [],
    },
    codex: {
      categories: [
        mkCat('agents', CODEX_ROOT + '/agents', [mkEntry('agents-a', 'agents-a.md', CODEX_ROOT + '/agents/agents-a.md')]),
      ],
      duplicates: [],
    },
    shared: {
      categories: [
        mkCat('skills', SHARED_TRUNK + '/skills', [mkEntry('skills-s', 'skills-s.md', SHARED_TRUNK + '/skills/skills-s.md')]),
      ],
      duplicates: [],
    },
  })
}

// Nur-claude-AppData (Gegenprobe): keine shared-/codex-Pfade -> resolveFamilyRoot
// fuer eine Fremd-Familie MUSS undefined liefern.
function claudeOnly(): AppData {
  return mkAppData({
    claude: {
      categories: [
        mkCat('rules', CLAUDE_ROOT + '/rules', [mkEntry('rules-r', 'rules-r.md', CLAUDE_ROOT + '/rules/rules-r.md')]),
      ],
      duplicates: [],
    },
  })
}

// Separator-toleranter Treffer-Check: ein knownPath endet (modulo \ -> /) auf das Ziel.
function someEndsWith(paths: string[], suffix: string): boolean {
  return paths.some((p) => p.replace(/\\/g, '/').includes(suffix))
}

// ── Fall 1: buildKnownPaths sammelt ueber ALLE Familien ──────────────────────
test('buildKnownPaths (llm=claude) traegt sowohl die .shared/.claude- als auch die .codex-Wurzel', () => {
  const data = multiFamily()
  const paths = buildKnownPaths(data, 'claude', '')
  // Die ZIEL-Familien-Wurzeln muessen vorkommen (Cross-Family-Move braucht sie):
  expect(someEndsWith(paths, '.shared/.claude/skills')).toBe(true) // shared-Trunk eingesammelt
  expect(someEndsWith(paths, '.codex/agents')).toBe(true) // codex eingesammelt
  // Aktuelle Familie ('claude') ist ebenfalls vertreten und steht (PathPicker) zuerst.
  expect(someEndsWith(paths, '.claude/rules')).toBe(true)
  expect(paths.length).toBeGreaterThanOrEqual(3)
})

// ── Fall 2: resolveFamilyRoot fuer shared findet den Trunk (+ Gegenprobe) ─────
test('resolveFamilyRoot(shared, multiFamily-knownPaths) -> .shared/.claude-Trunk, NICHT undefined', () => {
  const paths = buildKnownPaths(multiFamily(), 'claude', '')
  const root = resolveFamilyRoot('shared', paths)
  expect(root).toBe(SHARED_TRUNK) // exakt bis einschliesslich .shared/.claude gekappt
  expect(root).not.toBeUndefined()
})

test('Gegenprobe: resolveFamilyRoot(shared, nur-claude-knownPaths) -> undefined (Regression-Faenger)', () => {
  // Genau hier scheiterte der Cross-Family-Move, als buildKnownPaths nur die
  // aktuelle Familie sammelte: kein .shared/.claude-Pfad -> undefined -> leeres Ziel.
  const paths = buildKnownPaths(claudeOnly(), 'claude', '')
  expect(resolveFamilyRoot('shared', paths)).toBeUndefined()
})

// ── Fall 3: buildQuickPath fuer shared -> absolutes Ziel unter dem Trunk ──────
test('buildQuickPath(shared, cat, name) -> absoluter Pfad unter .shared/.claude; Ordner endet auf "/"', () => {
  const roots = buildKnownPaths(multiFamily(), 'claude', '')
  const file = buildQuickPath('shared', 'skills', 'Datei', 'neu.md', roots)
  expect(file).toBe(SHARED_TRUNK + '/skills/neu.md')
  expect(isAbsolutePath(file)).toBe(true)
  const folder = buildQuickPath('shared', 'skills', 'Ordner', 'neu', roots)
  expect(folder).toBe(SHARED_TRUNK + '/skills/neu/')
  expect(folder.endsWith('/')).toBe(true)
  expect(isAbsolutePath(folder)).toBe(true)
})

// ── Fall 4: buildQuickPath fuer claude bleibt unter der claude-Wurzel ─────────
test('buildQuickPath(claude, ...) bleibt absolut unter .claude und trifft NICHT den .shared/.claude-Trunk', () => {
  const roots = buildKnownPaths(multiFamily(), 'claude', '')
  const file = buildQuickPath('claude', 'rules', 'Datei', 'neu.md', roots)
  expect(file).toBe(CLAUDE_ROOT + '/rules/neu.md')
  expect(isAbsolutePath(file)).toBe(true)
  // 'claude' darf den Trunk-`.shared/.claude` NICHT als Wurzel verwenden.
  expect(file.includes('.shared/.claude')).toBe(false)
})

test('resolveFamilyRoot erhaelt POSIX-, Drive- und UNC-Praefixe', () => {
  expect(resolveFamilyRoot('codex', ['/home/u/.codex/agents'], 'linux'))
    .toBe('/home/u/.codex')
  expect(resolveFamilyRoot('codex', ['C:\\Users\\u\\.codex\\agents'], 'win32'))
    .toBe('C:/Users/u/.codex')
  expect(resolveFamilyRoot('codex', ['\\\\server\\share\\.codex\\agents'], 'win32'))
    .toBe('//server/share/.codex')
})

test('buildQuickPath erhaelt POSIX-, Drive- und UNC-Praefixe', () => {
  expect(buildQuickPath('codex', 'agents', 'Datei', 'neu.md', ['/home/u/.codex'], 'linux'))
    .toBe('/home/u/.codex/agents/neu.md')
  expect(buildQuickPath('codex', 'agents', 'Datei', 'neu.md', ['C:\\Users\\u\\.codex'], 'win32'))
    .toBe('C:/Users/u/.codex/agents/neu.md')
  expect(buildQuickPath('codex', 'agents', 'Ordner', 'neu', ['\\\\server\\share\\.codex'], 'win32'))
    .toBe('//server/share/.codex/agents/neu/')
})

test('POSIX-Doppel-Slash ist kein UNC und bleibt case-sensitiv', () => {
  expect(resolveFamilyRoot('codex', ['//srv/Home/.codex/agents'], 'linux'))
    .toBe('//srv/Home/.codex')
  expect(resolveFamilyRoot('codex', ['//srv/Home/.CODEX/agents'], 'linux'))
    .toBeUndefined()
  expect(resolveFamilyRoot('codex', ['//SERVER/Share/.CODEX/agents'], 'win32'))
    .toBe('//SERVER/Share/.CODEX')
})

test('POSIX behandelt eingebetteten und trailing Backslash in Segmenten als literal', () => {
  expect(lastSegment('/home/u/dir\\child', 'linux')).toBe('dir\\child')
  expect(lastSegment('/home/u/report.md\\', 'linux')).toBe('report.md\\')
})

test('POSIX-Dateiendung mit literal Backslash bleibt ein Datei-Ziel', () => {
  const knownFolders = new Set<string>()
  const fileWithBackslash = '/home/u/report.md\\suffix'
  const fileWithTrailingBackslash = '/home/u/report.md\\'
  expect(endsOnFolder(fileWithBackslash, 'target.md', knownFolders, 'linux')).toBe(false)
  expect(endsOnFolder(fileWithTrailingBackslash, 'target.md', knownFolders, 'linux')).toBe(false)
  expect(ensureFileTarget(fileWithBackslash, 'target.md', 'Datei', knownFolders, 'linux'))
    .toBe(fileWithBackslash)
  expect(ensureFileTarget('/home/u/folder\\', 'target.md', 'Datei', knownFolders, 'linux'))
    .toBe('/home/u/folder\\/target.md')
})

test('Windows behaelt Slash- und Backslash-Segment-/Trailing-Verhalten', () => {
  const knownFolders = new Set<string>()
  expect(lastSegment('C:/tmp/folder/file.md', 'win32')).toBe('file.md')
  expect(lastSegment('C:\\tmp\\folder\\file.md', 'win32')).toBe('file.md')
  expect(endsOnFolder('C:/tmp/folder/', 'target.md', knownFolders, 'win32')).toBe(true)
  expect(endsOnFolder('C:\\tmp\\folder\\', 'target.md', knownFolders, 'win32')).toBe(true)
  expect(ensureFileTarget('C:/tmp/folder/', 'target.md', 'Datei', knownFolders, 'win32'))
    .toBe('C:/tmp/folder/target.md')
  expect(ensureFileTarget('C:\\tmp\\folder\\', 'target.md', 'Datei', knownFolders, 'win32'))
    .toBe('C:\\tmp\\folder/target.md')
})
