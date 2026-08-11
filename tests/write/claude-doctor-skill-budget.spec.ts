import { expect, test } from '@playwright/test'
import {
  auditClaudeSkillListingBudget,
  type ClaudeSkillCandidate,
  type EffectiveSkillListingSettings,
} from '../../src/main/scan/claude-skill-budget-audit'

function native(runtimeName: string, frontmatter: string, body = ''): ClaudeSkillCandidate {
  return { runtimeName, source: 'native', skillText: `---\n${frontmatter}\n---\n${body}` }
}

function plugin(
  runtimeName: string,
  pluginId: string,
  installPath: string,
  version: string,
  description: string,
): ClaudeSkillCandidate {
  return { runtimeName, source: 'plugin', pluginId, pluginInstallPath: installPath,
    pluginVersion: version, skillText: `---\ndescription: ${description}\n---\nSECRET_BODY` }
}

function settings(overrides: Partial<EffectiveSkillListingSettings> = {}): EffectiveSkillListingSettings {
  return { skillOverrides: {}, enabledPlugins: {}, activePluginInstalls: [], platform: 'win32', ...overrides }
}

test('folds and preserves YAML block scalars and includes when_to_use', () => {
  const folded = native('folded', 'description: >-\n  alpha\n  beta\n\n  gamma\nwhen_to_use: "delta epsilon"')
  const literal = native('literal', 'description: |-\n  alpha\n  beta\nwhen_to_use: zeta')
  const clippedFolded = native('clipped-folded', 'description: >\n  one\n  two')
  const clippedLiteral = native('clipped-literal', 'description: |\n  one\n  two')

  const result = auditClaudeSkillListingBudget(
    [folded, literal, clippedFolded, clippedLiteral],
    settings(),
    100_000,
  )

  expect(result.metrics.nameCharacterCount).toBe(
    'folded'.length + 'literal'.length + 'clipped-folded'.length + 'clipped-literal'.length,
  )
  expect(result.metrics.descriptionCharacterCount).toBe(
    'alpha beta\ngamma delta epsilon'.length + 'alpha\nbeta zeta'.length
      + 'one two'.length + 'one\ntwo'.length,
  )
  expect(result.metrics.status).toBe('within-budget')
})

test('supports plain and quoted scalars and caps combined description plus when_to_use', () => {
  const candidates = [
    native('plain', 'description: plain text\nwhen_to_use: now'),
    native('single', "description: 'single quoted'"),
    native('double', 'description: "double quoted"'),
  ]
  const result = auditClaudeSkillListingBudget(candidates, settings({ skillListingMaxDescChars: 8 }), 20_000)

  expect(result.metrics.descriptionCharacterCount).toBe(24)
  expect(result.metrics.characterCount).toBe('plainsingledouble'.length + 24)
})

test('applies non-plugin visibility modes while plugin overrides stay irrelevant', () => {
  const activePath = 'C:\\cache\\market\\demo\\2.0.0'
  const candidates = [
    native('on', 'description: abc'),
    native('name-only', 'description: hidden'),
    native('user-only', 'description: hidden'),
    native('off', 'description: hidden'),
    plugin('demo:tool', 'demo@market', activePath, '2.0.0', 'plugin description'),
  ]
  const result = auditClaudeSkillListingBudget(candidates, settings({
    skillOverrides: { 'name-only': 'name-only', 'user-only': 'user-invocable-only', off: 'off', 'demo:tool': 'off' },
    enabledPlugins: { 'demo@market': true },
    activePluginInstalls: [{ pluginId: 'demo@market', installPath: activePath, version: '2.0.0' }],
  }), 100_000)

  expect(result.metrics.listedSkillCount).toBe(3)
  expect(result.metrics.excludedSkillCount).toBe(2)
  expect(result.metrics.descriptionCharacterCount).toBe('abc'.length + 'plugin description'.length)
})

test('excludes disabled plugins and counts only the active installed cache copy', () => {
  const candidates = [
    plugin('demo:tool', 'demo@market', 'C:\\cache\\demo\\1.0.0', '1.0.0', 'old'),
    plugin('demo:tool', 'demo@market', 'C:\\CACHE\\demo\\2.0.0\\', '2.0.0', 'active'),
    plugin('demo:tool', 'demo@market', 'C:\\cache\\demo\\2.0.0', '2.0.0', 'duplicate'),
    plugin('off:tool', 'off@market', 'C:\\cache\\off\\1.0.0', '1.0.0', 'disabled'),
  ]
  const result = auditClaudeSkillListingBudget(candidates, settings({
    enabledPlugins: { 'demo@market': true, 'off@market': false },
    activePluginInstalls: [{ pluginId: 'demo@market', installPath: 'C:\\cache\\demo\\2.0.0', version: '2.0.0' }],
  }), 100_000)

  expect(result.metrics.listedSkillCount).toBe(1)
  expect(result.metrics.excludedSkillCount).toBe(2)
  expect(result.metrics.duplicateSkillCount).toBe(1)
  expect(result.metrics.descriptionCharacterCount).toBe('active'.length)
})

test('uses the default fraction and distinguishes known within and over budget', () => {
  const candidate = native('budget', `description: ${'x'.repeat(394)}`)
  const within = auditClaudeSkillListingBudget([candidate], settings(), 10_000)
  const over = auditClaudeSkillListingBudget([candidate], settings(), 9_900)

  expect(within.metrics).toMatchObject({ budgetFraction: 0.01, estimatedTokens: 100,
    budgetTokens: 100, status: 'within-budget' })
  expect(within.findings).toEqual([])
  expect(over.metrics).toMatchObject({ budgetTokens: 99, status: 'over-budget' })
  expect(over.findings).toHaveLength(1)
  expect(over.findings[0]).toMatchObject({ rule: 'D9', kind: 'skill-listing-budget-exceeded', severity: 'conflict' })
})

test('unknown context reports the minimum without a finding or leaked content', () => {
  const sentinel = 'SENTINEL_DO_NOT_LEAK'
  const candidate = native('safe-name', 'description: visible', `${sentinel}\nC:\\private\\skill.md`)
  const result = auditClaudeSkillListingBudget([candidate], settings())
  const serialized = JSON.stringify(result)

  expect(result.metrics).toMatchObject({ status: 'context-unknown', budgetFraction: 0.01 })
  expect(result.metrics.minimumRequiredContextTokens).toBeGreaterThan(0)
  expect(result.metrics).not.toHaveProperty('contextWindowTokens')
  expect(result.findings).toEqual([])
  expect(serialized).not.toContain(sentinel)
  expect(serialized).not.toContain('private')
})

test('fixed character budget overrides an unknown context window', () => {
  const candidate = native('fixed', `description: ${'x'.repeat(40)}`)
  const result = auditClaudeSkillListingBudget([candidate], settings({ fixedCharacterBudget: 20 }))

  expect(result.metrics).toMatchObject({ status: 'over-budget', budgetCharacters: 20 })
  expect(result.findings[0].evidence).toContainEqual({ key: 'budgetCharacters', value: 20 })
  expect(result.findings[0].evidence?.some((item) => item.key === 'contextWindowTokens')).toBe(false)
})

test('rejects non-finite or out-of-range budget fractions', () => {
  const candidate = native('safe', 'description: safe')
  for (const fraction of [Number.NaN, Number.POSITIVE_INFINITY, 0, -0.1, 1.01]) {
    expect(() => auditClaudeSkillListingBudget([candidate], settings({ skillListingBudgetFraction: fraction }))).toThrow(RangeError)
  }
})
