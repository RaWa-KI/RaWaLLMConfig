import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  DEFAULT_DOCTOR_LIMITS,
  buildClaudeDoctorContext,
} from '../../src/main/scan/claude-doctor-context'
import { makeSandbox } from './fixtures'

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(value), 'utf8')
}

test('builds a whitelisted read-once context without raw commands or secrets', () => {
  const sb = makeSandbox()
  const claudeHome = path.join(sb.root, '.claude')
  const projectRoot = path.join(sb.root, 'project')
  const sharedDir = path.join(sb.root, '.shared')
  const registryDir = path.join(sharedDir, 'coordination', 'registry')
  const pluginRoot = path.join(sb.root, 'plugin-install')
  const hookPath = path.join(claudeHome, 'hooks', 'guard.cjs')
  const statePath = path.join(sb.root, '.claude.json')
  const sentinel = 'SENTINEL_DO_NOT_LEAK'
  writeJson(statePath, {
    projects: { [projectRoot]: { mcpServers: { local: { url: `https://local.invalid/mcp?token=${sentinel}` } } } },
    mcpServers: { user: { command: 'node', args: ['server.cjs', '--token', sentinel], env: { KEY: sentinel } } },
    skillUsage: { alpha: { usageCount: 0 }, ignored: sentinel },
    pluginUsage: { 'demo@market': { usageCount: 2 }, ignored: sentinel },
    prompt: sentinel,
  })
  writeJson(path.join(claudeHome, 'settings.json'), {
    enabledPlugins: { 'demo@market': true },
    extraKnownMarketplaces: { market: { source: { source: 'directory', path: pluginRoot } } },
    skillOverrides: { alpha: 'name-only', bad: sentinel },
    skillListingBudgetFraction: 0.02,
    skillListingMaxDescChars: 1200,
    hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: `node "${hookPath}" --token ${sentinel}`, timeout: 3 }] }] },
    ignored: sentinel,
  })
  writeJson(path.join(projectRoot, '.claude', 'settings.json'), {})
  writeJson(path.join(projectRoot, '.claude', 'settings.local.json'), {})
  writeJson(path.join(claudeHome, 'plugins', 'installed_plugins.json'), {
    plugins: { 'demo@market': [
      { version: '1.0.0', scope: 'user', installPath: pluginRoot, usageCount: 0, secret: sentinel },
      { version: '1.0.0', scope: 'user', installLocation: pluginRoot },
    ] },
  })
  writeJson(path.join(claudeHome, 'plugins', 'known_marketplaces.json'), {
    market: { installLocation: pluginRoot, source: { source: 'directory', path: pluginRoot }, secret: sentinel },
  })
  writeJson(path.join(projectRoot, '.mcp.json'), {
    mcpServers: { project: { type: 'http', url: `https://project.invalid/mcp#${sentinel}`, headers: { Auth: sentinel } } },
  })
  writeJson(path.join(pluginRoot, '.mcp.json'), {
    mcpServers: { plugin: { type: 'http', url: `https://plugin.invalid/mcp?secret=${sentinel}`, tools: ['search'] } },
  })
  writeJson(path.join(registryDir, 'localhost-ports.json'), {
    ports: { canonical: { service: 'playwright', port: 8830, protocol: 'http', token: sentinel } },
  })
  const reads = new Map<string, number>()
  const context = buildClaudeDoctorContext({ unknownHigherSettingsLayer: true, deps: {
    configRoots: () => ({ claudeHome, codexHome: path.join(sb.root, '.codex'), sharedClaude: path.join(sharedDir, '.claude'), projectRoot }),
    sharedDataRoots: () => ({ sharedDir, referencesDir: path.join(sharedDir, 'docs'), trackingDir: path.join(sharedDir, 'tracking'), registryDir }),
    readText: (filePath) => {
      reads.set(filePath, (reads.get(filePath) ?? 0) + 1)
      return readFileSync(filePath, 'utf8')
    },
  } })

  expect(context.projectKeys).toEqual([projectRoot])
  expect(context.skillUsage).toEqual({ 'alpha.usageCount': 0 })
  expect(context.pluginUsage).toEqual({ 'demo@market.usageCount': 2 })
  expect(context.settings.layers.map((layer) => layer.layer)).toEqual(['managed', 'local', 'project', 'user'])
  expect(context.settings.unknownHigherLayer).toBe(true)
  expect(context.settings.layers[3].skillListingMaxDescChars).toBe(1200)
  expect(context.settings.layers[3].hooks[0]).toMatchObject({ event: 'PreToolUse', timeoutSeconds: 3, scriptPath: hookPath, heavyClass: 'cold-interpreter' })
  expect(context.installedPlugins).toHaveLength(2)
  expect(context.mcpServices.map((service) => service.scope).sort()).toEqual(['local', 'plugin', 'project', 'user'])
  expect(context.canonicalPorts).toEqual([{ id: 'canonical', service: 'playwright', port: 8830, protocol: 'http' }])
  expect([...reads.values()].every((count) => count === 1)).toBe(true)
  expect(JSON.stringify(context)).not.toContain(sentinel)
  expect(JSON.stringify(context)).not.toContain('--token')
})

test('resolves roots per call and applies conservative limits', () => {
  const sb = makeSandbox()
  let suffix = 'one'
  let rootCalls = 0
  const deps = {
    configRoots: () => {
      rootCalls += 1
      const root = path.join(sb.root, suffix)
      return { claudeHome: path.join(root, '.claude'), codexHome: path.join(root, '.codex'), sharedClaude: null, projectRoot: null }
    },
    sharedDataRoots: () => null,
    readText: (): string => { throw new Error('fixture-missing') },
  }
  const first = buildClaudeDoctorContext({ deps })
  suffix = 'two'
  const second = buildClaudeDoctorContext({ deps })

  expect(first.paths.claudeStateJson).toBe(path.join(sb.root, 'one', '.claude.json'))
  expect(second.paths.claudeStateJson).toBe(path.join(sb.root, 'two', '.claude.json'))
  expect(rootCalls).toBe(2)
  expect(second.limits).toEqual(DEFAULT_DOCTOR_LIMITS)
  expect(second.paths.transcriptCandidates).toEqual([path.join(sb.root, 'two', '.claude', 'projects')])
  expect(second.paths.tempCandidates).toEqual([path.join(sb.root, 'two', '.claude', 'plugins', 'cache')])
  expect(second.paths.settings.managed).toBeTruthy()
  expect(second.settings.unknownHigherLayer).toBe(false)
})

test('normalizes stdio packages, captures ports and excludes unrelated project MCP state', () => {
  const sb = makeSandbox()
  const claudeHome = path.join(sb.root, '.claude')
  const projectRoot = path.join(sb.root, 'project')
  writeJson(path.join(sb.root, '.claude.json'), {
    mcpServers: {
      packageA: { command: 'npx', args: ['-y', '@scope/server@1.2.3', '--token', 'FIRST'] },
      packageB: { command: 'pnpm', args: ['dlx', '@scope/server@latest', '--secret', 'SECOND'] },
      ported: { command: 'node', args: ['server.cjs', '--port=8830'] },
    },
    projects: {
      [projectRoot.replace(/\\/g, '/')]: { mcpServers: { current: { url: 'http://localhost:9000/mcp' } } },
      [path.join(sb.root, 'unrelated')]: { mcpServers: { foreign: { url: 'http://localhost:9001/mcp' } } },
    },
  })
  const context = buildClaudeDoctorContext({ deps: {
    configRoots: () => ({ claudeHome, codexHome: path.join(sb.root, '.codex'), sharedClaude: null, projectRoot }),
    sharedDataRoots: () => null,
  } })
  const packageServices = context.mcpServices.filter((item) => item.name.startsWith('package'))

  expect(packageServices).toHaveLength(2)
  expect(packageServices[0].coreFingerprint).toBe(packageServices[1].coreFingerprint)
  expect(context.mcpServices.find((item) => item.name === 'ported')?.endpointPort).toBe(8830)
  expect(context.mcpServices.some((item) => item.name === 'current')).toBe(true)
  expect(context.mcpServices.some((item) => item.name === 'foreign')).toBe(false)
  expect(JSON.stringify(context)).not.toContain('FIRST')
  expect(JSON.stringify(context)).not.toContain('SECOND')
})
