// claude-doctor-audit.ts — verdrahtet D1-D11 auf reale Claude-Quellen.
import fs from 'node:fs'
import path from 'node:path'
import type { Category, ConfigEntry, CoverageItem } from '@shared/contract'
import { buildClaudeDoctorContext, DOCTOR_RULES } from './claude-doctor-context'
import type { ClaudeDoctorContext, ClaudeDoctorContextOptions, DoctorFinding } from './claude-doctor-context'
import { auditClaudeState } from './claude-state-audit'
import type { ClaudeDoctorPluginInventory, ClaudeDoctorSkillInventory } from './claude-state-audit'
import { auditComponentDuplicates, auditMcpSourceOverlaps, auditSharedRuntimeSources } from './claude-source-audit'
import type { DoctorComponentCandidate } from './claude-source-audit'
import { auditClaudeHookRuntime } from './claude-hook-runtime-audit'
import { auditClaudeHookStatic } from './claude-hook-static-audit'
import { auditClaudeSkillListingBudget } from './claude-skill-budget-audit'
import type { ClaudeSkillCandidate, EffectiveSkillListingSettings } from './claude-skill-budget-audit'
import { mtimeSafe, parseFrontmatter } from './scan-helpers'

interface PluginMeta extends ClaudeDoctorPluginInventory {
  root: string; version?: string; enabled: boolean
}
export interface Discovery {
  plugins: PluginMeta[]; skills: ClaudeDoctorSkillInventory[]
  listing: ClaudeSkillCandidate[]; components: DoctorComponentCandidate[]
  ruleWikilinks: string[]; hookSources: string[]
}
export interface DoctorRow { rule: string; name: string; path: string; reason: string; fields?: Record<string, string> }
export interface ClaudeDoctorAuditOptions {
  context?: ClaudeDoctorContextOptions; liveContextWindowTokens?: number
  env?: NodeJS.ProcessEnv
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function text(filePath: string, maxBytes = 256 * 1024): string | undefined {
  try { const stat = fs.lstatSync(filePath); if (!stat.isFile() || stat.size > maxBytes) return undefined
    return fs.readFileSync(filePath, 'utf8') } catch { return undefined }
}
function json(filePath: string): Record<string, unknown> | null {
  const raw = text(filePath); if (raw === undefined) return null
  try { return record(JSON.parse(raw) as unknown) } catch { return null }
}
function existing(filePath: string | undefined): boolean {
  if (!filePath) return false
  try { return fs.lstatSync(filePath).isDirectory() } catch { return false }
}
function pathKey(value: string): string {
  const normalized = path.resolve(value).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}
function files(root: string, accept: (filePath: string) => boolean, cap = 1_000): string[] {
  const out: string[] = []; const pending = [root]
  while (pending.length && out.length < cap) {
    const current = pending.pop() as string; let stat: fs.Stats
    try { stat = fs.lstatSync(current) } catch { continue }
    if (stat.isSymbolicLink()) continue
    if (stat.isFile()) { if (accept(current)) out.push(current); continue }
    if (!stat.isDirectory()) continue
    let names: string[]
    try { names = fs.readdirSync(current).sort().reverse() } catch { continue }
    names.forEach((name) => pending.push(path.join(current, name)))
  }
  return out
}
function settingMap<T extends boolean | string>(context: ClaudeDoctorContext, key: 'enabledPlugins' | 'skillOverrides'): Record<string, T> {
  const out: Record<string, T> = {}
  for (const layer of [...context.settings.layers].sort((a, b) => a.precedence - b.precedence)) {
    for (const [name, value] of Object.entries(layer[key])) if (!Object.hasOwn(out, name)) out[name] = value as T
  }
  return out
}
function firstNumber(context: ClaudeDoctorContext, key: 'skillListingBudgetFraction' | 'skillListingMaxDescChars'): number | undefined {
  return [...context.settings.layers].sort((a, b) => a.precedence - b.precedence)
    .map((layer) => layer[key]).find((value) => value !== undefined)
}
function marketplaceDefaults(context: ClaudeDoctorContext): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const market of context.knownMarketplaces) {
    if (!market.location || !existing(market.location)) continue
    const catalog = json(path.join(market.location, '.claude-plugin', 'marketplace.json'))
    const plugins = Array.isArray(catalog?.plugins) ? catalog.plugins : []
    for (const raw of plugins) {
      const item = record(raw); const name = typeof item?.name === 'string' ? item.name : ''
      if (name && typeof item?.defaultEnabled === 'boolean') out.set(`${name}@${market.name}`.toLowerCase(), item.defaultEnabled)
    }
  }
  return out
}
function dependencies(value: unknown, marketplace: string): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const item = record(raw); const name = typeof raw === 'string' ? raw : typeof item?.name === 'string' ? item.name : ''
    if (!name) return []; return [name.includes('@') ? name : `${name}@${marketplace}`]
  })
}
function pluginInventory(context: ClaudeDoctorContext): PluginMeta[] {
  const defaults = marketplaceDefaults(context); const enabled = settingMap<boolean>(context, 'enabledPlugins')
  const roots = new Set<string>(); const out: PluginMeta[] = []
  for (const installed of context.installedPlugins) {
    const root = [installed.installPath, installed.installLocation].find(existing)
    if (!root || roots.has(pathKey(root))) continue
    roots.add(pathKey(root)); const manifest = json(path.join(root, '.claude-plugin', 'plugin.json'))
    const marketplace = installed.pluginId.split('@').slice(1).join('@')
    const manifestDefault = typeof manifest?.defaultEnabled === 'boolean' ? manifest.defaultEnabled : undefined
    const defaultEnabled = defaults.get(installed.pluginId.toLowerCase()) ?? manifestDefault
    const explicit = Object.entries(enabled).find(([id]) => id.toLowerCase() === installed.pluginId.toLowerCase())?.[1]
    out.push({ pluginId: installed.pluginId, root, ...(installed.version ? { version: installed.version } : {}),
      ...(defaultEnabled === undefined ? {} : { defaultEnabled }), dependencies: dependencies(manifest?.dependencies, marketplace),
      enabled: explicit ?? defaultEnabled ?? true })
  }
  let changed = true
  while (changed) { changed = false
    for (const plugin of out.filter((item) => item.enabled)) for (const dependency of plugin.dependencies ?? []) {
      const target = out.find((item) => item.pluginId.toLowerCase() === dependency.toLowerCase())
      if (target && !target.enabled && enabled[target.pluginId] !== false) { target.enabled = true; changed = true }
    }
  }
  return out
}
function addComponents(root: string, scope: DoctorComponentCandidate['scope'], plugin: PluginMeta | undefined,
  components: DoctorComponentCandidate[], skills: ClaudeDoctorSkillInventory[], listing: ClaudeSkillCandidate[]): void {
  const enabled = plugin?.enabled ?? true
  for (const kind of ['agent', 'skill'] as const) {
    const base = path.join(root, `${kind}s`)
    for (const filePath of files(base, (item) => kind === 'agent' ? /\.md$/i.test(item) : path.basename(item).toLowerCase() === 'skill.md')) {
      const skillText = text(filePath); if (skillText === undefined) continue
      const fm = parseFrontmatter(skillText); const frontmatterName = fm.name?.trim()
      components.push({ kind, scope, filePath, sourceBasename: path.basename(filePath),
        ...(frontmatterName ? { frontmatterName } : {}), ...(plugin ? { pluginEnabled: enabled } : {}) })
      if (kind !== 'skill') continue
      const baseName = frontmatterName || path.basename(path.dirname(filePath))
      const runtimeName = plugin ? `${plugin.pluginId.split('@')[0]}:${baseName}` : baseName
      const modelVisible = fm['disable-model-invocation']?.toLowerCase() !== 'true'
      skills.push({ id: runtimeName, name: runtimeName, ...(plugin ? { pluginId: plugin.pluginId } : {}),
        passive: !modelVisible, active: enabled })
      listing.push({ runtimeName, skillText, source: plugin ? 'plugin' : 'native', modelVisible,
        ...(plugin ? { pluginId: plugin.pluginId, pluginVersion: plugin.version, pluginInstallPath: plugin.root } : {}) })
    }
  }
}
export function discover(context: ClaudeDoctorContext): Discovery {
  const plugins = pluginInventory(context); const skills: ClaudeDoctorSkillInventory[] = []
  const listing: ClaudeSkillCandidate[] = []; const components: DoctorComponentCandidate[] = []
  addComponents(context.paths.claudeHome, 'global', undefined, components, skills, listing)
  if (context.paths.projectRoot) addComponents(path.join(context.paths.projectRoot, '.claude'), 'workspace', undefined, components, skills, listing)
  plugins.forEach((plugin) => addComponents(plugin.root, 'plugin', plugin, components, skills, listing))
  const ruleFiles = [path.join(context.paths.claudeHome, 'CLAUDE.md'),
    ...files(path.join(context.paths.claudeHome, 'rules'), (item) => /\.md$/i.test(item), 500)]
  const ruleWikilinks = ruleFiles.flatMap((filePath) => text(filePath)?.match(/\[\[[^\]]+\]\]/g) ?? [])
  const hookRoots = [path.join(context.paths.claudeHome, 'hooks'),
    ...(context.paths.projectRoot ? [path.join(context.paths.projectRoot, '.claude', 'hooks')] : []),
    ...context.candidates.hookSources.map((item) => path.dirname(item)), ...plugins.filter((item) => item.enabled).map((item) => path.join(item.root, 'hooks'))]
  const hookSources = [...new Set([...context.candidates.hookSources,
    ...hookRoots.flatMap((root) => files(root, (item) => /\.(?:c?js|mjs)$/i.test(item), 500))])]
  return { plugins, skills, listing, components, ruleWikilinks, hookSources }
}

export const RULE_NAMES: Record<string, string> = {
  D1: 'Projektpfad-Kollision', D2: 'Verwaister Plugin-Cache', D3: 'Ungenutzte aktive Komponente',
  D4: 'MCP-Dienst doppelt', D5: 'Komponentenname doppelt', D6: 'Shared als Runtime-Quelle',
  D7: 'Hook-Timeouts beobachtet', D8: 'Hook-Konfiguration auffällig', D9: 'Skill-Listing über Budget',
  D10: 'Hook-Fehler', D11: 'Zustand vor Zustellung gespeichert',
}
function sourcePath(context: ClaudeDoctorContext, finding: DoctorFinding): string {
  const byKind: Partial<Record<DoctorFinding['source']['kind'], string | null>> = {
    'claude-state': context.paths.claudeStateJson, 'installed-plugins': context.paths.installedPluginsJson,
    'known-marketplaces': context.paths.knownMarketplacesJson, 'project-mcp': context.paths.projectMcpJson,
    'port-registry': context.paths.portRegistryJson,
  }
  if (finding.source.kind === 'settings') {
    return Object.values(context.paths.settings).find((item) => path.basename(item) === finding.source.basename)
      ?? context.paths.settings.user ?? context.paths.claudeHome
  }
  return byKind[finding.source.kind] ?? context.paths.claudeHome
}
function evidenceFields(finding: DoctorFinding): Record<string, string> {
  return Object.fromEntries((finding.evidence ?? []).map((item) => [item.key, String(item.value)]))
}
export function findingRows(context: ClaudeDoctorContext, findings: DoctorFinding[]): DoctorRow[] {
  return findings.map((finding) => ({ rule: finding.rule, name: `${finding.rule} · ${RULE_NAMES[finding.rule]}`,
    path: sourcePath(context, finding), reason: finding.kind, fields: evidenceFields(finding) }))
}
function numberFromEnv(value: string | undefined): number | undefined {
  if (!/^\d+$/.test(value ?? '')) return undefined
  const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}
export function runtimeContextTokens(options: ClaudeDoctorAuditOptions): number | undefined {
  if (options.liveContextWindowTokens !== undefined) return options.liveContextWindowTokens
  const env = options.env ?? process.env
  return /^(?:1|true|yes|on)$/i.test(env.DISABLE_COMPACT ?? '')
    ? numberFromEnv(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS) : undefined
}
export function skillSettings(context: ClaudeDoctorContext, discovery: Discovery,
  env: NodeJS.ProcessEnv): EffectiveSkillListingSettings {
  const enabledPlugins = settingMap<boolean>(context, 'enabledPlugins')
  discovery.plugins.forEach((plugin) => { enabledPlugins[plugin.pluginId] = plugin.enabled })
  return { enabledPlugins, skillOverrides: settingMap(context, 'skillOverrides'),
    activePluginInstalls: discovery.plugins.filter((item) => item.enabled).map((item) => ({
      pluginId: item.pluginId, installPath: item.root, ...(item.version ? { version: item.version } : {}),
    })), skillListingBudgetFraction: firstNumber(context, 'skillListingBudgetFraction'),
    skillListingMaxDescChars: firstNumber(context, 'skillListingMaxDescChars'),
    fixedCharacterBudget: numberFromEnv(env.SLASH_COMMAND_TOOL_CHAR_BUDGET), platform: process.platform }
}
export function sharedRows(context: ClaudeDoctorContext): DoctorRow[] {
  if (!context.paths.sharedDir) return []
  const marketplaces = context.settings.layers.flatMap((layer) => layer.extraKnownMarketplaces.map((item) => ({
    marketplace: item.name, sourceKind: item.sourceKind, location: item.location,
    sourceFile: context.paths.settings[layer.layer] ?? context.paths.claudeHome,
  })))
  const knownMarketplaces = context.knownMarketplaces.map((item) => ({ marketplace: item.name,
    registryFile: context.paths.knownMarketplacesJson, installLocation: item.location, available: existing(item.location) }))
  const installed = context.installedPlugins.map((item) => ({ ...item,
    registryFile: context.paths.installedPluginsJson,
    available: existing(item.installPath) || existing(item.installLocation) }))
  return auditSharedRuntimeSources({ sharedRoot: context.paths.sharedDir, marketplaces, knownMarketplaces, installed })
    .map((finding) => ({ rule: 'D6', name: `D6 · ${RULE_NAMES.D6}`, path: finding.runtimePath,
      reason: finding.counterpart.state === 'present' ? 'Runtime-Quelle mit Gegenstück' : 'Runtime-Quelle ohne Gegenstück',
      fields: { Quelle: finding.runtimeSource.type, Gegenstück: finding.counterpart.state,
        Abschaltbar: String(finding.disableEligible) } }))
}
export function category(rows: DoctorRow[], anchor: string): Category[] {
  const unique = [...new Map(rows.map((row) => [`${row.rule}|${row.path}|${row.reason}|${row.name}`, row])).values()]
  if (!unique.length) return []
  const rules = DOCTOR_RULES.filter((rule) => unique.some((row) => row.rule === rule))
  const reason = `${unique.length} belegte Fundstellen; Regeln: ${rules.join(', ')}`
  const coverageItems: CoverageItem[] = unique.slice(0, 20).map((row) => ({ name: row.name, path: row.path }))
  const entry: ConfigEntry = { id: 'audit-claude-doctor-summary', name: 'Prüfergebnisse: Claude Doctor D1–D11',
    status: 'conflict', scope: 'global', path: anchor, desc: reason, updated: mtimeSafe(anchor),
    fields: { Fundstellen: String(unique.length), Regeln: rules.join(', ') }, conflictReason: reason,
    coverageItems, coverageItemsTotal: unique.length, fileBacked: false }
  return [{ id: 'audit-claude-doctor', label: 'Claude Doctor D1–D11', icon: 'rule', path: anchor,
    blurb: 'Read-only Erkennung belegter Claude-Setup-Risiken', entries: [entry] }]
}

export function buildClaudeDoctorCategories(options: ClaudeDoctorAuditOptions = {}): Category[] {
  const context = buildClaudeDoctorContext(options.context); const found = discover(context)
  const rows = findingRows(context, auditClaudeState(context, {
    plugins: found.plugins, skills: found.skills, ruleWikilinks: found.ruleWikilinks,
  }))
  rows.push(...auditMcpSourceOverlaps(context.mcpServices, context.canonicalPorts).map((finding) => ({
    rule: 'D4', name: `D4 · ${RULE_NAMES.D4}`, path: context.paths.claudeHome, reason: finding.signal,
    fields: { Quellen: `${finding.left.scope}/${finding.right.scope}`, Tools: String(finding.toolOverlapCount) },
  })))
  rows.push(...auditComponentDuplicates(found.components).map((finding) => ({ rule: 'D5',
    name: `D5 · ${finding.name}`, path: finding.source.filePath, reason: `${finding.componentKind}: ${finding.source.scope}/plugin` })))
  rows.push(...sharedRows(context))
  const runtime = auditClaudeHookRuntime({ transcriptRoots: context.paths.transcriptCandidates, limits: context.limits.transcripts })
  rows.push(...runtime.runtimes.filter((item) => item.timeouts > 0).map((item) => ({ rule: 'D7',
    name: `D7 · ${item.hookName}`, path: context.paths.transcriptCandidates[0] ?? context.paths.claudeHome,
    reason: `${item.timeouts} beobachtete Timeouts`, fields: { Event: item.hookEvent,
      p50ms: String(item.p50Ms ?? 'n/a'), p90ms: String(item.p90Ms ?? 'n/a') } })))
  const staticAudit = auditClaudeHookStatic({ settingsLayers: context.settings.layers, sourcePaths: found.hookSources })
  rows.push(...staticAudit.configuration.map((item) => ({ rule: 'D8', name: `D8 · ${item.hookName}`,
    path: found.hookSources.find((candidate) => path.basename(candidate) === item.hookName) ?? context.paths.claudeHome,
    reason: item.labels.join(', '), fields: { Event: item.event, Timeout: String(item.timeoutSeconds ?? 'n/a') } })))
  rows.push(...runtime.errors.map((item) => ({ rule: 'D10', name: `D10 · ${item.hookName}`,
    path: context.paths.transcriptCandidates[0] ?? context.paths.claudeHome, reason: item.errorClass,
    fields: { Fingerprint: item.fingerprint, Anzahl: String(item.count) } })))
  rows.push(...staticAudit.undefinedIdentifiers.map((item) => ({ rule: 'D10', name: `D10 · ${item.name}`,
    path: item.filePath, reason: 'Undefinierter ALL-CAPS-Bezeichner', fields: { Zeile: String(item.line) } })))
  rows.push(...staticAudit.deliveryOrder.map((item) => ({ rule: 'D11', name: `D11 · ${path.basename(item.filePath)}`,
    path: item.filePath, reason: `${item.stateCall} vor ${item.deliveryCall}` })))
  try { rows.push(...findingRows(context, auditClaudeSkillListingBudget(found.listing,
    skillSettings(context, found, options.env ?? process.env), runtimeContextTokens(options)).findings))
  } catch { rows.push({ rule: 'D9', name: `D9 · ${RULE_NAMES.D9}`, path: context.paths.settings.user ?? context.paths.claudeHome,
    reason: 'Ungültige Skill-Budget-Einstellung' }) }
  return category(rows, context.paths.claudeHome)
}
