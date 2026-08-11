// claude-state-audit.ts — read-only D1-D3-Pruefungen auf sanitisiertem Kontext.
import path from 'node:path'
import type { ClaudeDoctorContext, DoctorFinding, DoctorSettingsLayer } from './claude-doctor-context'
import { auditTempGitCache, auditTempGitCacheAsync } from './claude-state-audit-async'
import type { StateAuditIo } from './claude-state-audit-async'

export { auditTempGitCache } from './claude-state-audit-async'
export type { StateAuditIo } from './claude-state-audit-async'

export interface ClaudeDoctorPluginInventory { pluginId: string; defaultEnabled?: boolean; dependencies?: string[] }
export interface ClaudeDoctorSkillInventory {
  id: string; name: string; pluginId?: string; passive?: boolean; active?: boolean
}
export interface ClaudeStateAuditInput {
  plugins?: ClaudeDoctorPluginInventory[]; skills?: ClaudeDoctorSkillInventory[]
  ruleWikilinks?: string[]; io?: StateAuditIo
}
function normalizedId(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}
function safeComponentId(value: string): string {
  const normalized = value.normalize('NFKC').trim().slice(0, 160)
  return normalized && !/[\\/]/.test(normalized) && !/^[a-z]:/i.test(normalized)
    ? normalized
    : 'component'
}
function source(context: ClaudeDoctorContext, kind: 'claude-state' | 'known-marketplaces') {
  const filePath = kind === 'claude-state' ? context.paths.claudeStateJson : context.paths.knownMarketplacesJson
  return { kind, basename: path.basename(filePath) } as const
}
export function auditProjectKeyCollisions(context: ClaudeDoctorContext): DoctorFinding[] {
  const groups = new Map<string, Set<string>>()
  for (const raw of context.projectKeys) {
    const value = raw.normalize('NFKC')
    const key = value.replace(/\\/g, '/').toLowerCase()
    const group = groups.get(key) ?? new Set<string>()
    group.add(value)
    groups.set(key, group)
  }
  const kinds = new Map<string, Array<Set<string>>>([
    ['case-only', []], ['slash-only', []], ['case+slash', []],
  ])
  for (const group of [...groups.values()].filter((item) => item.size > 1)) {
    const values = [...group]
    const caseForms = new Set(values.map((item) => item.toLowerCase()))
    const slashForms = new Set(values.map((item) => item.replace(/\\/g, '/')))
    const kind = caseForms.size === 1 ? 'case-only'
      : slashForms.size === 1 ? 'slash-only' : 'case+slash'
    kinds.get(kind)?.push(group)
  }
  const findings: DoctorFinding[] = []
  for (const kind of ['case-only', 'slash-only', 'case+slash']) {
    const matches = kinds.get(kind) ?? []
    matches.forEach((group, index) => findings.push({
      rule: 'D1', kind: `project-key-${kind}`, severity: 'warning',
      source: source(context, 'claude-state'),
      evidence: [{ key: 'groupOrdinal', value: index + 1 }, { key: 'groupSize', value: group.size }],
    }))
  }
  return findings
}
function usageCounts(leaves: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  for (const [key, value] of Object.entries(leaves)) {
    if (!key.endsWith('.usageCount')) continue
    out.set(normalizedId(key.slice(0, -'.usageCount'.length)), value)
  }
  return out
}
function effectiveSetting(layers: DoctorSettingsLayer[], field: 'enabledPlugins' | 'skillOverrides',
  aliases: Set<string>): boolean | string | undefined {
  for (const layer of [...layers].sort((a, b) => a.precedence - b.precedence)) {
    const entries = Object.entries(layer[field]).filter(([key]) => aliases.has(normalizedId(key)))
    if (!entries.length) continue
    if (field === 'skillOverrides' && entries.some(([, value]) => value === 'off')) return 'off'
    return entries[0][1]
  }
  return undefined
}
function activePlugins(context: ClaudeDoctorContext, inventory: ClaudeDoctorPluginInventory[]): Set<string> {
  const installed = new Set(context.installedPlugins.map((item) => normalizedId(item.pluginId)))
  const metadata = new Map(inventory.map((item) => [normalizedId(item.pluginId), item]))
  const ids = new Set([...installed, ...metadata.keys()])
  for (const layer of context.settings.layers) Object.keys(layer.enabledPlugins).forEach((id) => ids.add(normalizedId(id)))
  const active = new Set<string>()
  for (const id of ids) {
    const explicit = effectiveSetting(context.settings.layers, 'enabledPlugins', new Set([id]))
    if (explicit === true || (explicit === undefined && metadata.get(id)?.defaultEnabled !== false)) active.add(id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...active]) for (const dependency of metadata.get(id)?.dependencies ?? []) {
      const dep = normalizedId(dependency)
      const explicit = effectiveSetting(context.settings.layers, 'enabledPlugins', new Set([dep]))
      if (explicit !== false && !active.has(dep) && (installed.has(dep) || metadata.has(dep))) {
        active.add(dep); changed = true
      }
    }
  }
  return active
}
function pluginLifetimeCount(context: ClaudeDoctorContext, pluginId: string): number | undefined {
  const aggregate = usageCounts(context.pluginUsage).get(pluginId)
  if (aggregate !== undefined) return aggregate
  const records = context.installedPlugins.filter((item) => normalizedId(item.pluginId) === pluginId)
  if (!records.length || records.some((item) => item.usageCount === undefined)) return undefined
  const counts = records.map((item) => item.usageCount as number)
  if (counts.some((value) => value > 0)) return Math.max(...counts)
  return counts.every((value) => value === 0) ? 0 : undefined
}
function wikilinkAliases(links: string[]): Set<string> {
  const out = new Set<string>()
  for (const raw of links) {
    const target = raw.trim().replace(/^\[\[/, '').replace(/\]\]$/, '').split('|', 1)[0].split('#', 1)[0]
      .replace(/\\/g, '/').replace(/\.md$/i, '').replace(/\/SKILL$/i, '')
    if (!target) continue
    out.add(normalizedId(target))
    out.add(normalizedId(target.slice(target.lastIndexOf('/') + 1)))
  }
  return out
}
function skillAliasSets(skills: ClaudeDoctorSkillInventory[]): Map<string, Set<string>> {
  const unscoped = new Map<string, Set<string>>()
  for (const skill of skills) {
    const tail = normalizedId(skill.name).split(':').pop() as string
    const ids = unscoped.get(tail) ?? new Set<string>()
    ids.add(normalizedId(skill.id)); unscoped.set(tail, ids)
  }
  return new Map(skills.map((skill) => {
    const aliases = new Set([normalizedId(skill.id), normalizedId(skill.name)])
    if (skill.pluginId) aliases.add(normalizedId(`${skill.pluginId}:${skill.name}`))
    const tail = normalizedId(skill.name).split(':').pop() as string
    if (unscoped.get(tail)?.size === 1) aliases.add(tail)
    return [normalizedId(skill.id), aliases]
  }))
}
export function auditUnusedClaudeComponents(context: ClaudeDoctorContext,
  input: ClaudeStateAuditInput): DoctorFinding[] {
  if (context.settings.unknownHigherLayer) return []
  const active = activePlugins(context, input.plugins ?? [])
  const findings: DoctorFinding[] = []
  for (const pluginId of [...active].sort()) {
    if (pluginLifetimeCount(context, pluginId) !== 0) continue
    findings.push({ rule: 'D3', kind: 'unused-plugin-lifetime', severity: 'info',
      source: source(context, 'claude-state'), evidence: [
        { key: 'componentId', value: safeComponentId(pluginId) }, { key: 'usageCount', value: 0 },
      ] })
  }
  const skills = input.skills ?? []
  const aliases = skillAliasSets(skills)
  const linked = wikilinkAliases(input.ruleWikilinks ?? [])
  const counts = usageCounts(context.skillUsage)
  for (const skill of [...skills].sort((a, b) => a.id.localeCompare(b.id))) {
    const keys = aliases.get(normalizedId(skill.id)) ?? new Set<string>()
    if (skill.passive || skill.active === false || (skill.pluginId && !active.has(normalizedId(skill.pluginId)))) continue
    if (effectiveSetting(context.settings.layers, 'skillOverrides', keys) === 'off') continue
    if ([...keys].some((key) => linked.has(key))) continue
    const observed = [...keys].flatMap((key) => counts.has(key) ? [counts.get(key) as number] : [])
    if (!observed.some((value) => value === 0) || observed.some((value) => value > 0)) continue
    findings.push({ rule: 'D3', kind: 'unused-skill-lifetime', severity: 'info',
      source: source(context, 'claude-state'), evidence: [
        { key: 'componentId', value: safeComponentId(skill.id) },
        { key: 'componentName', value: safeComponentId(skill.name) },
        { key: 'usageCount', value: 0 },
      ] })
  }
  return findings
}
export function auditClaudeState(context: ClaudeDoctorContext,
  input: ClaudeStateAuditInput = {}): DoctorFinding[] {
  return [
    ...auditProjectKeyCollisions(context),
    ...auditTempGitCache(context, input.io),
    ...auditUnusedClaudeComponents(context, input),
  ]
}

export async function auditClaudeStateAsync(context: ClaudeDoctorContext,
  input: ClaudeStateAuditInput = {}): Promise<DoctorFinding[]> {
  return [
    ...auditProjectKeyCollisions(context),
    ...await auditTempGitCacheAsync(context, input.io),
    ...auditUnusedClaudeComponents(context, input),
  ]
}
