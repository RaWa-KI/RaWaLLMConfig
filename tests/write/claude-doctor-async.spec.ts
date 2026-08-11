import fs, { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { auditTempGitCache } from '../../src/main/scan/claude-state-audit'
import { auditTempGitCacheAsync } from '../../src/main/scan/claude-state-audit-async'
import type { ClaudeDoctorContext, DoctorSettingsLayer } from '../../src/main/scan/claude-doctor-context'
import { DEFAULT_DOCTOR_LIMITS } from '../../src/main/scan/claude-doctor-context'
import { makeSandbox } from './fixtures'

function layer(name: DoctorSettingsLayer['layer'], precedence: number): DoctorSettingsLayer {
  return { layer: name, precedence, observability: 'read', enabledPlugins: {},
    extraKnownMarketplaces: [], skillOverrides: {}, hooks: [] }
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
      projectMcpJson: null, portRegistryJson: null, settings: {}, transcriptCandidates: [],
      tempCandidates: [],
    },
    limits: { transcripts: { ...DEFAULT_DOCTOR_LIMITS.transcripts },
      tempCandidates: { ...DEFAULT_DOCTOR_LIMITS.tempCandidates } },
    projectKeys: [], skillUsage: {}, pluginUsage: {}, settings: { unknownHigherLayer: false,
      layers: ['managed', 'local', 'project', 'user'].map((name, index) =>
        layer(name as DoctorSettingsLayer['layer'], index)) },
    installedPlugins: [], knownMarketplaces: [], mcpServices: [], canonicalPorts: [],
    candidates: { pluginRoots: [], hookSources: [], componentRoots: [] },
    coverage: { sources: [] }, sourceIssues: [],
  }
}

function directory(root: string, name: string): string {
  const result = path.join(root, name)
  mkdirSync(result, { recursive: true })
  return result
}

test('D2 async matches sync for nested candidates and never follows reparse points', async () => {
  const sb = makeSandbox()
  const cache = directory(sb.root, 'cache')
  const external = directory(sb.root, 'external')
  writeFileSync(path.join(external, 'sentinel.txt'), 'outside', 'utf8')
  const orphan = directory(cache, path.join('nested', 'temp_git_orphan'))
  writeFileSync(path.join(orphan, 'one.txt'), 'abc', 'utf8')
  writeFileSync(path.join(directory(orphan, 'child'), 'two.txt'), '1234', 'utf8')
  const linkKind = process.platform === 'win32' ? 'junction' : 'dir'
  symlinkSync(external, path.join(orphan, 'nested-link'), linkKind)
  symlinkSync(external, path.join(cache, 'temp_git_reparse'), linkKind)
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]

  const sync = auditTempGitCache(context)
  const asyncResult = await auditTempGitCacheAsync(context)

  expect(asyncResult).toEqual(sync)
  expect(JSON.stringify(asyncResult)).not.toContain('sentinel')
})

test('D2 async preserves caps and the legacy fixture-I/O contract', async () => {
  const sb = makeSandbox()
  const cache = directory(sb.root, 'cache')
  for (const name of ['temp_git_a', 'temp_git_b']) {
    const candidate = directory(cache, name)
    writeFileSync(path.join(candidate, 'one.txt'), '1234', 'utf8')
    writeFileSync(path.join(candidate, 'two.txt'), '5678', 'utf8')
  }
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]
  context.limits.tempCandidates = { maxCandidates: 1, maxEntriesPerCandidate: 1,
    maxBytesPerCandidate: 4 }
  const legacyIo = {
    readdir: (filePath: string) => fs.readdirSync(filePath),
    lstat: (filePath: string) => fs.lstatSync(filePath),
  }

  const expected = auditTempGitCache(context, legacyIo)

  expect(await auditTempGitCacheAsync(context, legacyIo)).toEqual(expected)
  expect(await auditTempGitCacheAsync(context)).toEqual(expected)
  expect(expected.some((item) => item.kind === 'temp-cache-scan-incomplete')).toBe(true)
})

test('D2 Dirent discovery avoids per-entry lstat and async traversal yields by budget', async () => {
  const sb = makeSandbox()
  const cache = directory(sb.root, 'cache')
  for (let index = 0; index < 140; index += 1) {
    writeFileSync(path.join(cache, `ordinary-${String(index).padStart(3, '0')}.txt`), 'x', 'utf8')
  }
  const orphan = directory(cache, 'temp_git_orphan')
  writeFileSync(path.join(orphan, 'payload.txt'), 'payload', 'utf8')
  const context = contextFor(sb.root)
  context.paths.tempCandidates = [cache]
  let syncLstats = 0
  const syncResult = auditTempGitCache(context, {
    readdir: (filePath) => fs.readdirSync(filePath),
    readdirWithTypes: (filePath) => fs.readdirSync(filePath, { withFileTypes: true }),
    lstat: (filePath) => { syncLstats += 1; return fs.lstatSync(filePath) },
  })
  let asyncLstats = 0
  let yields = 0
  const asyncResult = await auditTempGitCacheAsync(context, {
    readdir: (filePath) => fs.promises.readdir(filePath),
    readdirWithTypes: (filePath) => fs.promises.readdir(filePath, { withFileTypes: true }),
    lstat: async (filePath) => { asyncLstats += 1; return fs.promises.lstat(filePath) },
    yieldNow: async () => { yields += 1 },
  })

  expect(asyncResult).toEqual(syncResult)
  expect(syncLstats).toBe(1)
  expect(asyncLstats).toBe(1)
  expect(yields).toBeGreaterThan(0)
})
