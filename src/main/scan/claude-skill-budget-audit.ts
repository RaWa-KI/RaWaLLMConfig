// claude-skill-budget-audit.ts — D9 misst nur das effektive Skill-Listing.
import type { DoctorFinding } from './claude-doctor-context'

const DEFAULT_DESCRIPTION_CAP = 1536
const DEFAULT_BUDGET_FRACTION = 0.01
const CHARS_PER_TOKEN = 4

type SkillVisibilityMode = 'on' | 'name-only' | 'user-invocable-only' | 'off'

export interface ClaudeSkillCandidate {
  runtimeName: string
  skillText: string
  source: 'native' | 'plugin'
  modelVisible?: boolean
  pluginId?: string
  pluginVersion?: string
  pluginInstallPath?: string
}

interface ActivePluginInstall {
  pluginId: string
  installPath: string
  version?: string
}

export interface EffectiveSkillListingSettings {
  skillOverrides?: Record<string, SkillVisibilityMode>
  enabledPlugins?: Record<string, boolean>
  activePluginInstalls?: ActivePluginInstall[]
  skillListingMaxDescChars?: number
  skillListingBudgetFraction?: number
  fixedCharacterBudget?: number
  platform?: string
}

interface SkillListingMetrics {
  status: 'within-budget' | 'over-budget' | 'context-unknown'
  listedSkillCount: number
  excludedSkillCount: number
  duplicateSkillCount: number
  nameCharacterCount: number
  descriptionCharacterCount: number
  characterCount: number
  estimatedTokens: number
  skillListingMaxDescChars: number
  budgetFraction: number
  minimumRequiredContextTokens: number
  contextWindowTokens?: number
  budgetTokens?: number
  budgetCharacters?: number
}

export interface ClaudeSkillBudgetAuditResult {
  metrics: SkillListingMetrics
  findings: DoctorFinding[]
}

interface ParsedFrontmatter {
  description?: string
  when_to_use?: string
}

interface BlockValue {
  value: string
  nextIndex: number
}

function frontmatterBody(text: string): string | null {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const match = /^---[ \t]*\n([\s\S]*?)\n---(?:[ \t]*\n|$)/.exec(normalized)
  return match?.[1] ?? null
}

function inlineScalar(raw: string): string {
  const value = raw.trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) as string } catch { return value.slice(1, -1) }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }
  return value
}

function dedentBlock(lines: string[]): string[] {
  const indents = lines.filter((line) => line.trim()).map((line) => /^ */.exec(line)?.[0].length ?? 0)
  const indent = indents.length > 0 ? Math.min(...indents) : 0
  return lines.map((line) => line.trim() ? line.slice(indent) : '')
}

function foldBlock(lines: string[]): string {
  let value = ''
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index]
    const next = lines[index + 1]
    value += current
    if (next === undefined) continue
    if (current && next) value += ' '
    else if (current || !next) value += '\n'
  }
  return value
}

function applyChomp(value: string, chomp: string | undefined, hasLines: boolean): string {
  const stripped = value.replace(/\n+$/g, '')
  if (chomp === '-') return stripped
  if (!hasLines) return ''
  if (chomp === '+') return `${value}\n`
  return `${stripped}\n`
}

function blockScalar(lines: string[], start: number, style: string, chomp?: string): BlockValue {
  const raw: string[] = []
  let index = start
  while (index < lines.length && (!lines[index].trim() || /^\s/.test(lines[index]))) {
    raw.push(lines[index])
    index += 1
  }
  const content = dedentBlock(raw)
  const value = style === '>' ? foldBlock(content) : content.join('\n')
  return { value: applyChomp(value, chomp, content.length > 0), nextIndex: index }
}

function parseListingFrontmatter(text: string): ParsedFrontmatter {
  const body = frontmatterBody(text)
  if (body === null) return {}
  const lines = body.split('\n')
  const output: ParsedFrontmatter = {}
  let index = 0
  while (index < lines.length) {
    const match = /^(description|when_to_use)\s*:\s*(.*)$/.exec(lines[index])
    index += 1
    if (!match) continue
    const block = /^([>|])([+-])?$/.exec(match[2].trim())
    let value: string
    if (block) {
      const parsed = blockScalar(lines, index, block[1], block[2])
      value = parsed.value
      index = parsed.nextIndex
    } else value = inlineScalar(match[2])
    output[match[1] as keyof ParsedFrontmatter] = value
  }
  return output
}

function validFraction(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BUDGET_FRACTION
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new RangeError('skillListingBudgetFraction must be finite and within (0, 1]')
  }
  return value
}

function validDescriptionCap(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DESCRIPTION_CAP
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError('skillListingMaxDescChars must be a non-negative finite integer')
  }
  return value
}

function normalizedPath(value: string, platform: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '')
  return platform === 'win32' ? normalized.toLowerCase() : normalized
}

function activePluginCandidate(
  candidate: ClaudeSkillCandidate,
  settings: EffectiveSkillListingSettings,
): boolean {
  if (!candidate.pluginId || settings.enabledPlugins?.[candidate.pluginId] !== true) return false
  if (!candidate.pluginInstallPath) return false
  const platform = settings.platform ?? process.platform
  const candidatePath = normalizedPath(candidate.pluginInstallPath, platform)
  return (settings.activePluginInstalls ?? []).some((install) => {
    if (install.pluginId !== candidate.pluginId) return false
    if (normalizedPath(install.installPath, platform) !== candidatePath) return false
    return install.version === undefined || install.version === candidate.pluginVersion
  })
}

function visibility(candidate: ClaudeSkillCandidate, settings: EffectiveSkillListingSettings): SkillVisibilityMode | null {
  if (candidate.modelVisible === false) return null
  if (candidate.source === 'plugin') return activePluginCandidate(candidate, settings) ? 'on' : null
  const mode = settings.skillOverrides?.[candidate.runtimeName] ?? 'on'
  return mode === 'off' || mode === 'user-invocable-only' ? null : mode
}

function descriptionLength(skillText: string, cap: number): number {
  const frontmatter = parseListingFrontmatter(skillText)
  const combined = [frontmatter.description, frontmatter.when_to_use]
    .map((value) => value?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  return combined.slice(0, cap).length
}

function listingCounts(candidates: ClaudeSkillCandidate[], settings: EffectiveSkillListingSettings, cap: number): Omit<SkillListingMetrics,
  'status' | 'estimatedTokens' | 'skillListingMaxDescChars' | 'budgetFraction' | 'minimumRequiredContextTokens' | 'contextWindowTokens' | 'budgetTokens' | 'budgetCharacters'> {
  const seen = new Set<string>()
  let listedSkillCount = 0; let excludedSkillCount = 0; let duplicateSkillCount = 0
  let nameCharacterCount = 0; let descriptionCharacterCount = 0
  for (const candidate of candidates) {
    const mode = visibility(candidate, settings)
    const name = candidate.runtimeName.trim()
    if (!mode || !name) { excludedSkillCount += 1; continue }
    if (seen.has(name)) { duplicateSkillCount += 1; continue }
    seen.add(name); listedSkillCount += 1; nameCharacterCount += name.length
    if (mode === 'on') descriptionCharacterCount += descriptionLength(candidate.skillText, cap)
  }
  return { listedSkillCount, excludedSkillCount, duplicateSkillCount, nameCharacterCount,
    descriptionCharacterCount, characterCount: nameCharacterCount + descriptionCharacterCount }
}

function overBudgetFinding(metrics: SkillListingMetrics): DoctorFinding {
  return { rule: 'D9', kind: 'skill-listing-budget-exceeded', severity: 'conflict',
    source: { kind: 'settings', basename: 'effective-skill-listing' }, evidence: [
      { key: 'listedSkills', value: metrics.listedSkillCount },
      { key: 'characters', value: metrics.characterCount },
      { key: 'estimatedTokens', value: metrics.estimatedTokens },
      ...(metrics.budgetTokens === undefined ? [] : [{ key: 'budgetTokens', value: metrics.budgetTokens }]),
      ...(metrics.budgetCharacters === undefined ? [] : [{ key: 'budgetCharacters', value: metrics.budgetCharacters }]),
      ...(metrics.contextWindowTokens === undefined ? [] : [{ key: 'contextWindowTokens', value: metrics.contextWindowTokens }]),
      { key: 'budgetFraction', value: metrics.budgetFraction },
    ] }
}

export function auditClaudeSkillListingBudget(
  candidates: ClaudeSkillCandidate[],
  settings: EffectiveSkillListingSettings,
  liveContextWindowTokens?: number,
): ClaudeSkillBudgetAuditResult {
  const budgetFraction = validFraction(settings.skillListingBudgetFraction)
  const skillListingMaxDescChars = validDescriptionCap(settings.skillListingMaxDescChars)
  const fixedCharacterBudget = validDescriptionCap(settings.fixedCharacterBudget)
  const counts = listingCounts(candidates, settings, skillListingMaxDescChars)
  const estimatedTokens = Math.ceil(counts.characterCount / CHARS_PER_TOKEN)
  const minimumRequiredContextTokens = Math.ceil(estimatedTokens / budgetFraction)
  if (settings.fixedCharacterBudget !== undefined) {
    const status = counts.characterCount > fixedCharacterBudget ? 'over-budget' : 'within-budget'
    const metrics: SkillListingMetrics = { ...counts, status, estimatedTokens, skillListingMaxDescChars,
      budgetFraction, minimumRequiredContextTokens, budgetCharacters: fixedCharacterBudget }
    return { metrics, findings: status === 'over-budget' ? [overBudgetFinding(metrics)] : [] }
  }
  const contextKnown = Number.isFinite(liveContextWindowTokens) && (liveContextWindowTokens ?? 0) > 0
  if (!contextKnown) return { metrics: { ...counts, status: 'context-unknown', estimatedTokens,
    skillListingMaxDescChars, budgetFraction, minimumRequiredContextTokens }, findings: [] }
  const contextWindowTokens = Math.floor(liveContextWindowTokens as number)
  const budgetTokens = Math.floor(contextWindowTokens * budgetFraction)
  const status = estimatedTokens > budgetTokens ? 'over-budget' : 'within-budget'
  const metrics: SkillListingMetrics = { ...counts, status, estimatedTokens, skillListingMaxDescChars,
    budgetFraction, minimumRequiredContextTokens, contextWindowTokens, budgetTokens }
  return { metrics, findings: status === 'over-budget' ? [overBudgetFinding(metrics)] : [] }
}
