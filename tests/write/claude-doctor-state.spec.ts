import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  auditProjectKeyCollisions,
  auditTempGitCache,
  auditUnusedClaudeComponents,
} from '../../src/main/scan/claude-state-audit'
import type { ClaudeDoctorContext, DoctorFinding, DoctorSettingsLayer } from '../../src/main/scan/claude-doctor-context'
import { DEFAULT_DOCTOR_LIMITS } from '../../src/main/scan/claude-doctor-context'
import { makeSandbox } from './fixtures'

function settingsLayer(layer: DoctorSettingsLayer['layer'], precedence: number): DoctorSettingsLayer {
  return {
    layer, precedence, observability: 'read', enabledPlugins: {},
    extraKnownMarketplaces: [], skillOverrides: {}, hooks: [],
  }
}

function contextFor(root: string): ClaudeDoctorContext {
  const claudeHome = path.join(root, '.claude')
  return {
    paths: {
      claudeHome, projectRoot: path.join(root, 'project'), sharedDir: null,
      claudeStateJson: path.join(root, '.claude.json'), pluginDir: path.join(claudeHome, 'plugins'),
      pluginCacheDir: path.join(claudeHome, 'plugins', 'cache'),
      installedPluginsJson: path.join(claudeHome, 'plugins', 'installed_plugins.json'),
      knownMarketplacesJson: path.join(claudeHome, 'plugins', 'known_marketplaces.json'),
      projectMcpJson: null, portRegistryJson: null,
      settings: { managed: path.join(claudeHome, 'managed.json'), user: path.join(claudeHome, 'settings.json') },
      transcriptCandidates: [], tempCandidates: [],
    },
    limits: {
      transcripts: { ...DEFAULT_DOCTOR_LIMITS.transcripts },
      tempCandidates: { ...DEFAULT_DOCTOR_LIMITS.tempCandidates },
    },
    projectKeys: [], skillUsage: {}, pluginUsage: {},
    settings: {
      unknownHigherLayer: false,
      layers: ['managed', 'local', 'project', 'user'].map((name, index) =>
        settingsLayer(name as DoctorSettingsLayer['layer'], index)),
    },
    installedPlugins: [], knownMarketplaces: [], mcpServices: [], canonicalPorts: [],
    candidates: { pluginRoots: [], hookSources: [], componentRoots: [] },
    coverage: { sources: [] }, sourceIssues: [],
  }
}

function evidence(finding: DoctorFinding, key: string): string | number | boolean | undefined {
  return finding.evidence?.find((item) => item.key === key)?.value
}

function makeDir(root: string, name: string): string {
  const directory = path.join(root, name)
  mkdirSync(directory, { recursive: true })
  return directory
}

test('D1 reports disjoint case, slash and combined groups without project values', () => {
  const sb = makeSandbox()
  const context = contextFor(sb.root)
  context.projectKeys = [
    'Ｃ:\\Repo\\Alpha', 'c:\\repo\\alpha',
    'D:\\Repo\\Beta', 'D:/Repo/Beta',
    'F:\\Repo\\Gamma', 'f:/repo/gamma',
  ]

  const findings = auditProjectKeyCollisions(context)

  expect(findings.map((item) => item.kind)).toEqual([
    'project-key-case-only', 'project-key-slash-only', 'project-key-case+slash',
  ])
  expect(findings).toHaveLength(3)
  expect(findings.every((item) => evidence(item, 'groupSize') === 2)).toBe(true)
  expect(JSON.stringify(findings)).not.toContain('Repo')
})

test('D2 excludes every referenced marketplace path and measures each orphan', () => {
  const sb = makeSandbox()
  const cache = makeDir(sb.root, 'cache')
  const referenced = makeDir(cache, 'temp_git_referenced')
  const orphan = makeDir(cache, path.join('level-one', 'level-two', 'temp_git_orphan'))
  writeFileSync(path.join(orphan, 'one.txt'), 'abc', 'utf8')
  const nested = makeDir(orphan, 'nested')
  writeFileSync(path.join(nested, 'two.txt'), '1234', 'utf8')
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]
  context.knownMarketplaces = [
    { name: 'known', sourceKind: 'directory', location: referenced },
    { name: 'also-known', sourceKind: 'directory', location: path.relative(path.dirname(context.paths.knownMarketplacesJson), referenced) },
  ]

  const findings = auditTempGitCache(context)

  expect(findings).toHaveLength(1)
  expect(findings[0].kind).toBe('orphan-temp-git-cache')
  expect(evidence(findings[0], 'fileCount')).toBe(2)
  expect(evidence(findings[0], 'bytes')).toBe(7)
  expect(evidence(findings[0], 'incomplete')).toBe(false)
  expect(JSON.stringify(findings)).not.toContain(sb.root)
})

test('D2 marks candidate and traversal caps as incomplete', () => {
  const sb = makeSandbox()
  const cache = makeDir(sb.root, 'cache')
  for (const name of ['temp_git_a', 'temp_git_b']) {
    const directory = makeDir(cache, name)
    writeFileSync(path.join(directory, 'one.txt'), '1234', 'utf8')
    writeFileSync(path.join(directory, 'two.txt'), '5678', 'utf8')
  }
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]
  context.limits.tempCandidates = { maxCandidates: 1, maxEntriesPerCandidate: 1, maxBytesPerCandidate: 4 }

  const findings = auditTempGitCache(context)
  const orphan = findings.find((item) => item.kind === 'orphan-temp-git-cache')

  expect(orphan).toBeTruthy()
  expect(evidence(orphan as DoctorFinding, 'incomplete')).toBe(true)
  expect(findings.some((item) => item.kind === 'temp-cache-scan-incomplete')).toBe(true)
})

test('D2 never follows directory links or junctions', () => {
  const sb = makeSandbox()
  const cache = makeDir(sb.root, 'cache')
  const external = makeDir(sb.root, 'external')
  writeFileSync(path.join(external, 'SENTINEL.txt'), 'outside', 'utf8')
  const orphan = makeDir(cache, 'temp_git_orphan')
  writeFileSync(path.join(orphan, 'owned.txt'), 'abc', 'utf8')
  const linkKind = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(external, path.join(orphan, 'nested-link'), linkKind)
  symlinkSync(external, path.join(cache, 'temp_git_reparse'), linkKind)
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]

  const findings = auditTempGitCache(context)
  const orphanFinding = findings.find((item) => item.kind === 'orphan-temp-git-cache') as DoctorFinding
  const coverage = findings.find((item) => item.kind === 'temp-cache-scan-incomplete') as DoctorFinding

  expect(evidence(orphanFinding, 'fileCount')).toBe(1)
  expect(evidence(orphanFinding, 'bytes')).toBe(3)
  expect(evidence(coverage, 'skippedReparse')).toBe(1)
  expect(JSON.stringify(findings)).not.toContain('SENTINEL')
})

test('D3 uses effective precedence, defaults, dependencies and numeric lifetime counters', () => {
  const sb = makeSandbox()
  const context = contextFor(sb.root)
  const [managed, local, project] = context.settings.layers
  managed.enabledPlugins = { 'disabled@market': false }
  local.enabledPlugins = {
    'zero@market': true, 'used@market': true, 'missing@market': true, 'host@market': true,
  }
  project.enabledPlugins = { 'disabled@market': true }
  context.installedPlugins = [
    { pluginId: 'zero@market', usageCount: 0 },
    { pluginId: 'used@market', usageCount: 9 },
    { pluginId: 'missing@market' },
    { pluginId: 'host@market', usageCount: 2 },
    { pluginId: 'dependency@market', usageCount: 0 },
    { pluginId: 'default@market', usageCount: 0 },
    { pluginId: 'implicit@market', usageCount: 0 },
    { pluginId: 'disabled@market', usageCount: 0 },
  ]

  const findings = auditUnusedClaudeComponents(context, { plugins: [
    { pluginId: 'host@market', dependencies: ['dependency@market'] },
    { pluginId: 'dependency@market' },
    { pluginId: 'default@market', defaultEnabled: true },
    { pluginId: 'implicit@market' },
  ] })
  const ids = findings.map((item) => evidence(item, 'componentId'))

  expect(ids).toEqual(['default@market', 'dependency@market', 'implicit@market', 'zero@market'])
  expect(ids).not.toContain('used@market')
  expect(ids).not.toContain('missing@market')
  expect(ids).not.toContain('disabled@market')
})

test('D3 resolves unique nested aliases but never applies an ambiguous unscoped alias', () => {
  const sb = makeSandbox()
  const context = contextFor(sb.root)
  context.skillUsage = {
    'area:unique.usageCount': 0, 'unique.usageCount': 3,
    'one:shared.usageCount': 0, 'two:shared.usageCount': 2, 'shared.usageCount': 7,
  }

  const findings = auditUnusedClaudeComponents(context, { skills: [
    { id: 'area:unique', name: 'area:unique' },
    { id: 'one:shared', name: 'one:shared' },
    { id: 'two:shared', name: 'two:shared' },
  ] })

  expect(findings.map((item) => evidence(item, 'componentId'))).toEqual(['one:shared'])
})

test('D3 excludes passive, disabled, linked and unmeasurable skills', () => {
  const sb = makeSandbox()
  const context = contextFor(sb.root)
  context.skillUsage = {
    'zero.usageCount': 0, 'used.usageCount': 2, 'passive.usageCount': 0,
    'off.usageCount': 0, 'archiv-regel.usageCount': 0,
  }
  context.settings.layers[1].skillOverrides = { off: 'off' }

  const findings = auditUnusedClaudeComponents(context, {
    skills: [
      { id: 'zero', name: 'zero' }, { id: 'used', name: 'used' },
      { id: 'missing', name: 'missing' }, { id: 'passive', name: 'passive', passive: true },
      { id: 'off', name: 'off' }, { id: 'archiv-regel', name: 'archiv-regel' },
    ],
    ruleWikilinks: ['[[folder/archiv-regel#Rueckweg|Archiv]]'],
  })

  expect(findings.map((item) => evidence(item, 'componentId'))).toEqual(['zero'])
})

test('D3 emits no unused finding while a higher settings layer is unknown', () => {
  const sb = makeSandbox()
  const context = contextFor(sb.root)
  context.settings.unknownHigherLayer = true
  context.settings.layers[1].enabledPlugins = { 'zero@market': true }
  context.installedPlugins = [{ pluginId: 'zero@market', usageCount: 0 }]
  context.skillUsage = { 'zero-skill.usageCount': 0 }

  const findings = auditUnusedClaudeComponents(context, {
    skills: [{ id: 'zero-skill', name: 'zero-skill' }],
  })

  expect(findings).toEqual([])
})
