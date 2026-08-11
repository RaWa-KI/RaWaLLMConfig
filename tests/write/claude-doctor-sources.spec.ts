import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { DoctorSourceRef } from '../../src/main/scan/claude-doctor-context'
import {
  auditComponentDuplicates,
  auditMcpSourceOverlaps,
  auditSharedRuntimeSources,
} from '../../src/main/scan/claude-source-audit'
import type {
  DoctorComponentCandidate,
  DoctorMcpEvidence,
} from '../../src/main/scan/claude-source-audit'

function source(kind: DoctorSourceRef['kind'], basename: string): DoctorSourceRef {
  return { kind, basename }
}

function service(overrides: Partial<DoctorMcpEvidence>): DoctorMcpEvidence {
  return {
    name: 'service',
    transport: 'http',
    tools: [],
    scope: 'user',
    source: source('claude-state', '.claude.json'),
    ...overrides,
  }
}

function component(
  kind: DoctorComponentCandidate['kind'],
  scope: DoctorComponentCandidate['scope'],
  filePath: string,
  frontmatterName?: string,
  pluginEnabled?: boolean,
): DoctorComponentCandidate {
  return {
    kind,
    scope,
    filePath,
    sourceBasename: path.basename(filePath),
    ...(frontmatterName ? { frontmatterName } : {}),
    ...(pluginEnabled !== undefined ? { pluginEnabled } : {}),
  }
}

test('D4 erkennt gleichen Dienstkern ueber verschiedene Namen und Quellen', () => {
  const findings = auditMcpSourceOverlaps([
    service({ name: 'browser-user', coreFingerprint: 'core-a', scope: 'user' }),
    service({ name: 'browser-plugin', coreFingerprint: 'core-a', scope: 'plugin',
      source: source('plugin-mcp', '.mcp.json') }),
  ], [])

  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({
    rule: 'D4',
    signal: 'service-core',
    left: { name: 'browser-user', scope: 'user', source: { kind: 'claude-state' } },
    right: { name: 'browser-plugin', scope: 'plugin', source: { kind: 'plugin-mcp' } },
  })
})

test('D4 erkennt nur explizite Tool-Schnittmengen und normalisiert MCP-Namespaces', () => {
  const findings = auditMcpSourceOverlaps([
    service({ name: 'alpha', coreFingerprint: 'core-a', tools: ['mcp__alpha__browser_navigate'] }),
    service({ name: 'beta', coreFingerprint: 'core-b', tools: [
      'mcp__plugin_playwright_playwright__browser_navigate',
    ], scope: 'plugin', source: source('plugin-mcp', '.mcp.json') }),
  ], [])

  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({ signal: 'tool-overlap', toolOverlapCount: 1 })
})

test('D4 meldet Namensgleichheit ohne Kern oder Tool-Evidenz nicht', () => {
  const findings = auditMcpSourceOverlaps([
    service({ name: 'same', scope: 'user' }),
    service({ name: 'same', scope: 'project', source: source('project-mcp', '.mcp.json') }),
  ], [])

  expect(findings).toEqual([])
})

test('D4 bleibt fuer Dubletten innerhalb derselben Quelle still', () => {
  const findings = auditMcpSourceOverlaps([
    service({ name: 'first', coreFingerprint: 'same-core', scope: 'user' }),
    service({ name: 'second', coreFingerprint: 'same-core', scope: 'user' }),
  ], [])

  expect(findings).toEqual([])
})

test('D4 schuetzt den zentral registrierten Dienst und gibt keine Rohwerte aus', () => {
  const sentinel = 'SENTINEL_SECRET_VALUE'
  const user = service({
    name: 'playwright',
    tools: ['mcp__playwright__browser_navigate'],
    endpointPort: 8830,
  }) as DoctorMcpEvidence & { url: string; args: string[]; env: Record<string, string> }
  user.url = `http://127.0.0.1:8830/mcp?token=${sentinel}`
  user.args = ['--token', sentinel]
  user.env = { TOKEN: sentinel }
  const plugin = service({
    name: 'playwright-plugin',
    tools: ['mcp__plugin_playwright_playwright__browser_navigate'],
    scope: 'plugin',
    source: source('plugin-mcp', '.mcp.json'),
  })

  const findings = auditMcpSourceOverlaps([user, plugin], [
    { id: 'central-playwright-mcp', service: 'playwright-mcp', port: 8830, protocol: 'http' },
  ])

  expect(findings[0].left).toMatchObject({
    disposition: 'keep',
    canonicalRegistryId: 'central-playwright-mcp',
  })
  expect(findings[0].right.disposition).toBe('disable-candidate')
  expect(JSON.stringify(findings)).not.toContain(sentinel)
  expect(JSON.stringify(findings)).not.toContain('127.0.0.1')
})

test('D5 vergleicht nur explizite gleichartige Frontmatter-Namen mit aktivierten Plugins', () => {
  const candidates = [
    component('agent', 'global', 'C:\\cfg\\agents\\global.md', ' Ｋritiker '),
    component('agent', 'plugin', 'C:\\plugins\\one\\agents\\plugin.md', 'kritiker', true),
    component('skill', 'workspace', 'C:\\repo\\.claude\\skills\\street\\SKILL.md', 'Straße'),
    component('skill', 'plugin', 'C:\\plugins\\one\\skills\\street\\SKILL.md', 'STRASSE', true),
  ]

  const findings = auditComponentDuplicates(candidates)

  expect(findings).toHaveLength(2)
  expect(findings.map((finding) => [finding.componentKind, finding.source.scope, finding.plugin.scope]))
    .toEqual([['agent', 'global', 'plugin'], ['skill', 'workspace', 'plugin']])
})

test('D5 schliesst Filename-Fallback, falsche Paare und deaktivierte Plugins aus', () => {
  const candidates = [
    component('agent', 'global', 'C:\\cfg\\agents\\same.md'),
    component('agent', 'workspace', 'C:\\repo\\.claude\\agents\\same.md', 'same'),
    component('agent', 'plugin', 'C:\\plugins\\one\\agents\\same.md', 'same', false),
    component('agent', 'plugin', 'C:\\plugins\\two\\agents\\same.md', 'same', true),
    component('skill', 'global', 'C:\\cfg\\skills\\same\\SKILL.md', 'same'),
    component('skill', 'plugin', 'C:\\plugins\\three\\skills\\same\\SKILL.md', 'same', false),
  ]

  const findings = auditComponentDuplicates(candidates)

  expect(findings).toEqual([
    expect.objectContaining({
      componentKind: 'agent',
      source: expect.objectContaining({ scope: 'workspace' }),
      plugin: expect.objectContaining({ sourceBasename: 'same.md' }),
    }),
  ])
})

test('D6 prueft relative Marketplace-Pfade sowie beide Installationsfelder segment-sicher', () => {
  const sharedRoot = 'C:\\work\\.shared'
  const settingsFile = 'C:\\work\\config\\settings.json'
  const registryFile = 'C:\\work\\config\\installed_plugins.json'
  const pluginRoot = path.win32.join(sharedRoot, '.claude', 'plugins', 'rkwc')

  const findings = auditSharedRuntimeSources({
    sharedRoot,
    platform: 'win32',
    marketplaces: [
      { marketplace: 'rkwc', sourceFile: settingsFile, sourceKind: 'directory',
        location: '..\\.shared\\.claude\\plugins\\rkwc' },
      { marketplace: 'remote', sourceFile: settingsFile, sourceKind: 'github', location: pluginRoot },
    ],
    knownMarketplaces: [{ marketplace: 'RKWC', registryFile,
      installLocation: 'C:\\Profiles\\demo\\.claude\\plugins\\marketplaces\\rkwc', available: true }],
    installed: [
      { pluginId: 'rkwc@local', version: '1.0.0', registryFile, installPath: pluginRoot,
        installLocation: '..\\.shared\\.claude\\plugins\\rkwc', available: true },
      { pluginId: 'RKWC@LOCAL', version: '1.0.0', registryFile,
        installLocation: 'C:\\Profiles\\demo\\.claude\\plugins\\cache\\rkwc', available: true },
      { pluginId: 'missing@local', version: '2.0.0', registryFile,
        installPath: path.win32.join(sharedRoot, '.claude', 'plugins', 'missing'), available: true },
      { pluginId: 'prefix-trap', registryFile, installPath: 'C:\\work\\.shared-copy\\plugin' },
    ],
  })

  expect(findings.map((finding) => finding.runtimeSource.field))
    .toEqual(['directory', 'installPath', 'installLocation', 'installPath'])
  expect(findings.every((finding) => finding.mutation === 'none')).toBe(true)
  expect(findings.slice(0, 3).every((finding) => finding.disableEligible === true)).toBe(true)
  expect(findings[0].counterpart).toEqual({ kind: 'marketplace', identity: 'rkwc', state: 'present' })
  expect(findings[1].counterpart).toMatchObject({ kind: 'plugin-install', state: 'present', version: '1.0.0' })
  expect(findings[3]).toMatchObject({
    disableEligible: false,
    counterpart: { kind: 'plugin-install', state: 'missing', version: '2.0.0' },
  })
  expect(findings.some((finding) => finding.runtimeSource.owner === 'prefix-trap')).toBe(false)
})

test('D6 erlaubt nur bei belegten userglobalen Gegenstuecken einen Abschalthinweis', () => {
  const sharedRoot = '/work/.shared'
  const runtimeRoot = '/work/.shared/.claude/plugins/ready'

  const findings = auditSharedRuntimeSources({
    sharedRoot,
    platform: 'linux',
    marketplaces: [{ marketplace: 'ready', sourceFile: '/work/project/.claude/settings.json',
      sourceKind: 'directory', location: runtimeRoot }],
    knownMarketplaces: [{ marketplace: 'ready', registryFile: '/users/demo/.claude/plugins/known_marketplaces.json',
      installLocation: '/users/demo/.claude/plugins/marketplaces/ready', available: false }],
    installed: [
      { pluginId: 'ready@local', version: '1.0.0', registryFile: '/work/config/installed_plugins.json',
        installLocation: runtimeRoot, available: true },
      { pluginId: 'ready@local', version: '2.0.0', registryFile: '/users/demo/.claude/plugins/installed_plugins.json',
        installLocation: '/users/demo/.claude/plugins/cache/ready', available: true },
    ],
  })

  expect(findings).toHaveLength(2)
  expect(findings.every((finding) => finding.disableEligible === false)).toBe(true)
  expect(findings.map((finding) => finding.counterpart.state)).toEqual(['missing', 'missing'])
})
