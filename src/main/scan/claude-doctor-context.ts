// claude-doctor-context.ts — wertfreier Read-once-Eingang fuer D1-D11.
// Rohwerte bleiben innerhalb der Parser; der Kontext traegt nur Whitelist-Felder.
import fs from 'node:fs'
import path from 'node:path'
import { configRoots } from '../services/config-roots'
import type { ConfigRoots } from '../services/config-roots'
import { sharedDataRoots } from './shared-data-roots'
import type { SharedDataRoots } from './shared-data-roots'
import { collectLocalMcpServices, collectMcpServices } from './claude-doctor-mcp-context'
import {
  createJsonReader, isRecord, sourceRef, MAX_DOCTOR_JSON_BYTES
} from './claude-doctor-json-reader'
import type { DoctorSourceCoverage, DoctorSourceIssue, DoctorSourceRef, JsonReader } from './claude-doctor-json-reader'
// HR27-Split: Reader in claude-doctor-json-reader.ts; DoctorSourceRef bleibt
// hier re-exportiert (Bestands-Importe in mcp-context/source-audit).
export type { DoctorSourceRef } from './claude-doctor-json-reader'
export const DOCTOR_RULES = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11'] as const
type DoctorRule = typeof DOCTOR_RULES[number]
type DoctorSeverity = 'info' | 'warning' | 'conflict'
export interface DoctorFinding {
  rule: DoctorRule; kind: string; severity: DoctorSeverity; source: DoctorSourceRef
  evidence?: Array<{ key: string; value: string | number | boolean }>
}
export interface DoctorLimits {
  transcripts: { maxAgeDays: number; maxFiles: number; maxFileBytes: number; maxTotalBytes: number }
  tempCandidates: { maxCandidates: number; maxEntriesPerCandidate: number; maxBytesPerCandidate: number }
}
export const DEFAULT_DOCTOR_LIMITS: DoctorLimits = {
  transcripts: { maxAgeDays: 10, maxFiles: 100, maxFileBytes: 8 * 1024 ** 2, maxTotalBytes: 64 * 1024 ** 2 },
  tempCandidates: { maxCandidates: 256, maxEntriesPerCandidate: 50_000, maxBytesPerCandidate: 2 * 1024 ** 3 },
}
// Size-Cap MAX_DOCTOR_JSON_BYTES liegt in claude-doctor-json-reader.ts (eine Quelle).
type DoctorSettingsLayerName = 'managed' | 'local' | 'project' | 'user'
export interface DoctorHookRegistration {
  event: string; type: string; timeoutSeconds?: number; async: boolean; scriptPath?: string
  heavyClass?: 'network-client' | 'package-manager' | 'cold-interpreter'
}
export interface DoctorMarketplaceSource {
  name: string; sourceKind: string; location?: string; autoUpdate?: boolean
}
export interface DoctorSettingsLayer {
  layer: DoctorSettingsLayerName; precedence: number
  observability: 'read' | 'unavailable' | 'invalid' | 'unknown'
  enabledPlugins: Record<string, boolean>; extraKnownMarketplaces: DoctorMarketplaceSource[]
  skillOverrides: Record<string, 'on' | 'name-only' | 'user-invocable-only' | 'off'>
  skillListingBudgetFraction?: number; skillListingMaxDescChars?: number; hooks: DoctorHookRegistration[]
}
interface DoctorInstalledPluginRecord {
  pluginId: string; version?: string; scope?: string
  installPath?: string; installLocation?: string; usageCount?: number
}
export interface DoctorMcpService {
  name: string; projectKey?: string; transport: string; coreFingerprint?: string; tools: string[]
  endpointPort?: number
  scope: 'user' | 'local' | 'project' | 'plugin'
  source: DoctorSourceRef
}
interface DoctorContextPaths {
  claudeHome: string; projectRoot: string | null; sharedDir: string | null
  claudeStateJson: string; pluginDir: string; pluginCacheDir: string
  installedPluginsJson: string; knownMarketplacesJson: string
  projectMcpJson: string | null; portRegistryJson: string | null
  settings: Partial<Record<DoctorSettingsLayerName, string>>
  transcriptCandidates: string[]; tempCandidates: string[]
}
export interface ClaudeDoctorContext {
  paths: DoctorContextPaths; limits: DoctorLimits; projectKeys: string[]
  skillUsage: Record<string, number>; pluginUsage: Record<string, number>
  settings: { unknownHigherLayer: boolean; layers: DoctorSettingsLayer[] }
  installedPlugins: DoctorInstalledPluginRecord[]; knownMarketplaces: DoctorMarketplaceSource[]
  mcpServices: DoctorMcpService[]
  canonicalPorts: Array<{ id: string; service?: string; port?: number; protocol?: string }>
  candidates: { pluginRoots: string[]; hookSources: string[]; componentRoots: string[] }
  coverage: { sources: DoctorSourceCoverage[] }; sourceIssues: DoctorSourceIssue[]
}
export interface ClaudeDoctorContextOptions {
  paths?: Partial<Omit<DoctorContextPaths, 'settings'>> & { settings?: Partial<Record<DoctorSettingsLayerName, string>> }
  limits?: Partial<{ transcripts: Partial<DoctorLimits['transcripts']>; tempCandidates: Partial<DoctorLimits['tempCandidates']> }>
  unknownHigherSettingsLayer?: boolean
  deps?: { configRoots?: () => ConfigRoots; sharedDataRoots?: () => SharedDataRoots | null; readText?: (filePath: string) => string; maxJsonBytes?: number }
}
function resolvePaths(options: ClaudeDoctorContextOptions): DoctorContextPaths {
  const roots = (options.deps?.configRoots ?? configRoots)()
  const shared = (options.deps?.sharedDataRoots ?? sharedDataRoots)()
  const over = options.paths ?? {}
  const claudeHome = over.claudeHome ?? roots.claudeHome
  const projectRoot = Object.hasOwn(over, 'projectRoot') ? over.projectRoot ?? null : roots.projectRoot
  const sharedDir = Object.hasOwn(over, 'sharedDir') ? over.sharedDir ?? null : shared?.sharedDir ?? null
  const pluginDir = over.pluginDir ?? path.join(claudeHome, 'plugins')
  const defaults: DoctorContextPaths = {
    claudeHome, projectRoot, sharedDir,
    claudeStateJson: path.join(path.dirname(claudeHome), '.claude.json'),
    pluginDir, pluginCacheDir: path.join(pluginDir, 'cache'),
    installedPluginsJson: path.join(pluginDir, 'installed_plugins.json'),
    knownMarketplacesJson: path.join(pluginDir, 'known_marketplaces.json'),
    projectMcpJson: projectRoot ? path.join(projectRoot, '.mcp.json') : null,
    portRegistryJson: shared ? path.join(shared.registryDir, 'localhost-ports.json') : null,
    settings: {
      managed: process.env.RAWALLM_SANDBOX_ROOT
        ? path.join(process.env.RAWALLM_SANDBOX_ROOT, 'managed', 'managed-settings.json')
        : process.platform === 'win32'
        ? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'ClaudeCode', 'managed-settings.json')
        : process.platform === 'darwin' ? '/Library/Application Support/ClaudeCode/managed-settings.json'
          : '/etc/claude-code/managed-settings.json',
      local: projectRoot ? path.join(projectRoot, '.claude', 'settings.local.json') : undefined,
      project: projectRoot ? path.join(projectRoot, '.claude', 'settings.json') : undefined,
      user: path.join(claudeHome, 'settings.json'),
    },
    transcriptCandidates: [path.join(claudeHome, 'projects')], tempCandidates: [path.join(pluginDir, 'cache')],
  }
  return { ...defaults, ...over, settings: { ...defaults.settings, ...over.settings } }
}
function numericLeaves(value: unknown, out: Record<string, number>, prefix = '', depth = 0): void {
  if (depth > 8 || Object.keys(out).length >= 10_000) return
  if (typeof value === 'number' && Number.isFinite(value) && prefix) { out[prefix] = value; return }
  if (!isRecord(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (/password|secret|credential|authorization/i.test(key)) continue
    numericLeaves(child, out, prefix ? `${prefix}.${key}` : key, depth + 1)
  }
}
function safeLocation(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch { return value.split(/[?#]/, 1)[0] }
}
function marketplaceSources(value: unknown): DoctorMarketplaceSource[] {
  if (!isRecord(value)) return []
  const node = isRecord(value.marketplaces) ? value.marketplaces : value
  return Object.entries(node).map(([name, raw]) => {
    const item = isRecord(raw) ? raw : {}
    const source = isRecord(item.source) ? item.source : item
    const sourceKind = typeof source.source === 'string' ? source.source : 'unknown'
    const location = safeLocation(item.installLocation ?? source.path ?? source.repo ?? source.url)
    return { name, sourceKind, ...(location ? { location } : {}), ...(typeof item.autoUpdate === 'boolean' ? { autoUpdate: item.autoUpdate } : {}) }
  })
}
function hookRegistrations(value: unknown, settingsPath: string): DoctorHookRegistration[] {
  if (!isRecord(value)) return []
  const out: DoctorHookRegistration[] = []
  for (const [event, groups] of Object.entries(value)) {
    if (!Array.isArray(groups)) continue
    for (const group of groups) {
      const hooks = isRecord(group) && Array.isArray(group.hooks) ? group.hooks : []
      for (const raw of hooks) {
        if (!isRecord(raw)) continue
        const command = typeof raw.command === 'string' ? raw.command : ''
        const scriptPath = scriptFromCommand(command, path.dirname(settingsPath))
        const heavyClass = heavyCommandClass(command)
        out.push({ event, type: typeof raw.type === 'string' ? raw.type : 'command',
          ...(typeof raw.timeout === 'number' && Number.isFinite(raw.timeout) ? { timeoutSeconds: raw.timeout } : {}),
          async: raw.async === true, ...(scriptPath ? { scriptPath } : {}), ...(heavyClass ? { heavyClass } : {}) })
      }
    }
  }
  return out
}
function commandTokens(command: string): string[] {
  return (command.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((part) => part.replace(/^['"]|['"]$/g, ''))
}
function scriptFromCommand(command: string, base: string): string | undefined {
  const token = commandTokens(command).find((part) => /\.(?:c?m?js|ts|py|ps1)$/i.test(part))
  if (!token || /[\r\n]/.test(token)) return undefined
  return path.isAbsolute(token) ? path.normalize(token) : path.resolve(base, token)
}
function heavyCommandClass(command: string): DoctorHookRegistration['heavyClass'] {
  const bins = commandTokens(command).map((token) => path.basename(token).toLowerCase().replace(/\.exe$/, ''))
  if (bins.some((bin) => ['curl', 'wget', 'invoke-webrequest'].includes(bin))) return 'network-client'
  if (bins.some((bin) => ['npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx'].includes(bin))) return 'package-manager'
  if (bins.some((bin) => ['node', 'python', 'python3', 'pwsh', 'powershell'].includes(bin))) return 'cold-interpreter'
  return undefined
}
function settingsLayer(name: DoctorSettingsLayerName, index: number, filePath: string | undefined, reader: JsonReader): DoctorSettingsLayer {
  if (!filePath) return { layer: name, precedence: index, observability: name === 'managed' ? 'unknown' : 'unavailable', enabledPlugins: {}, extraKnownMarketplaces: [], skillOverrides: {}, hooks: [] }
  const raw = reader.read('settings', filePath)
  const node = isRecord(raw) ? raw : {}
  const enabledPlugins = isRecord(node.enabledPlugins) ? Object.fromEntries(Object.entries(node.enabledPlugins).filter((pair): pair is [string, boolean] => typeof pair[1] === 'boolean')) : {}
  const allowed = new Set(['on', 'name-only', 'user-invocable-only', 'off'])
  const skillOverrides = isRecord(node.skillOverrides) ? Object.fromEntries(Object.entries(node.skillOverrides).filter((pair): pair is [string, 'on' | 'name-only' | 'user-invocable-only' | 'off'] => typeof pair[1] === 'string' && allowed.has(pair[1]))) : {}
  const finite = (value: unknown): number | undefined => typeof value === 'number' && Number.isFinite(value) ? value : undefined
  return { layer: name, precedence: index, observability: reader.status(filePath) ?? 'unavailable', enabledPlugins,
    extraKnownMarketplaces: marketplaceSources(node.extraKnownMarketplaces), skillOverrides,
    ...(finite(node.skillListingBudgetFraction) !== undefined ? { skillListingBudgetFraction: finite(node.skillListingBudgetFraction) } : {}),
    ...(finite(node.skillListingMaxDescChars) !== undefined ? { skillListingMaxDescChars: finite(node.skillListingMaxDescChars) } : {}),
    hooks: hookRegistrations(node.hooks, filePath) }
}
function installedRecords(value: unknown): DoctorInstalledPluginRecord[] {
  if (!isRecord(value) || !isRecord(value.plugins)) return []
  const out: DoctorInstalledPluginRecord[] = []
  for (const [pluginId, raw] of Object.entries(value.plugins)) {
    for (const item of Array.isArray(raw) ? raw : [raw]) {
      if (!isRecord(item)) continue
      const text = (key: string): string | undefined => typeof item[key] === 'string' ? item[key] : undefined
      out.push({ pluginId, ...(text('version') ? { version: text('version') } : {}), ...(text('scope') ? { scope: text('scope') } : {}),
        ...(text('installPath') ? { installPath: text('installPath') } : {}), ...(text('installLocation') ? { installLocation: text('installLocation') } : {}),
        ...(typeof item.usageCount === 'number' && Number.isFinite(item.usageCount) ? { usageCount: item.usageCount } : {}) })
    }
  }
  return out
}
function canonicalPorts(value: unknown): ClaudeDoctorContext['canonicalPorts'] {
  if (!isRecord(value) || !isRecord(value.ports)) return []
  return Object.entries(value.ports).flatMap(([id, raw]) => {
    if (!isRecord(raw)) return []
    return [{ id, ...(typeof raw.service === 'string' ? { service: raw.service } : {}),
      ...(typeof raw.port === 'number' && Number.isFinite(raw.port) ? { port: raw.port } : {}),
      ...(typeof raw.protocol === 'string' ? { protocol: raw.protocol } : {}) }]
  })
}
function mergeLimits(input: ClaudeDoctorContextOptions['limits']): DoctorLimits {
  return { transcripts: { ...DEFAULT_DOCTOR_LIMITS.transcripts, ...input?.transcripts },
    tempCandidates: { ...DEFAULT_DOCTOR_LIMITS.tempCandidates, ...input?.tempCandidates } }
}
export function buildClaudeDoctorContext(options: ClaudeDoctorContextOptions = {}): ClaudeDoctorContext {
  const paths = resolvePaths(options)
  const reader = createJsonReader(options.deps?.readText ?? ((filePath) => fs.readFileSync(filePath, 'utf8')),
    options.deps?.maxJsonBytes ?? MAX_DOCTOR_JSON_BYTES)
  const state = reader.read('claude-state', paths.claudeStateJson)
  const stateNode = isRecord(state) ? state : {}
  const layers = (['managed', 'local', 'project', 'user'] as const).map((name, index) => settingsLayer(name, index, paths.settings[name], reader))
  const installed = installedRecords(reader.read('installed-plugins', paths.installedPluginsJson))
  const known = marketplaceSources(reader.read('known-marketplaces', paths.knownMarketplacesJson))
  const projectMcp = reader.read('project-mcp', paths.projectMcpJson)
  const ports = reader.read('port-registry', paths.portRegistryJson)
  const stateSource = sourceRef('claude-state', paths.claudeStateJson)
  const mcp = [...collectLocalMcpServices(state, paths.projectRoot, stateSource),
    ...collectMcpServices(projectMcp, 'project', sourceRef('project-mcp', paths.projectMcpJson ?? '.mcp.json'))]
  const pluginRoots = [...new Set(installed.flatMap((record) => [record.installPath, record.installLocation].filter((item): item is string => !!item)))]
  for (const root of pluginRoots) {
    const mcpPath = path.join(root, '.mcp.json')
    mcp.push(...collectMcpServices(reader.read('plugin-mcp', mcpPath), 'plugin', sourceRef('plugin-mcp', mcpPath)))
  }
  const skillUsage: Record<string, number> = {}; const pluginUsage: Record<string, number> = {}
  numericLeaves(stateNode.skillUsage, skillUsage); numericLeaves(stateNode.pluginUsage, pluginUsage)
  const hookSources = [...new Set(layers.flatMap((layer) => layer.hooks.flatMap((hook) => hook.scriptPath ? [hook.scriptPath] : [])))]
  const componentRoots = pluginRoots.flatMap((root) => [path.join(root, 'agents'), path.join(root, 'skills')])
  return { paths, limits: mergeLimits(options.limits), projectKeys: isRecord(stateNode.projects) ? Object.keys(stateNode.projects) : [], skillUsage, pluginUsage,
    settings: { unknownHigherLayer: options.unknownHigherSettingsLayer ?? !paths.settings.managed, layers }, installedPlugins: installed,
    knownMarketplaces: known, mcpServices: mcp, canonicalPorts: canonicalPorts(ports), candidates: { pluginRoots, hookSources, componentRoots },
    coverage: { sources: reader.coverage }, sourceIssues: reader.issues }
}
