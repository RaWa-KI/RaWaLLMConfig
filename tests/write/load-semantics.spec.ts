import { test, expect } from '@playwright/test'
import { classifyLoad } from '../../src/renderer/sections/compare/load-semantics'

const RULE_PATH = 'C:/Users/example/.claude/rules/code-quality.md'

test('rule without paths is classified as always-on', () => {
  const hint = classifyLoad(RULE_PATH, '~/.claude', { frontmatter: 'description' })
  expect(hint.when).toBe('immer')
  expect(hint.control).toContain('Kein paths')
})

test('rule with paths is classified as conditional', () => {
  const hint = classifyLoad(RULE_PATH, '~/.claude', { paths: '**/*.ts', frontmatter: 'description, paths' })
  expect(hint.when).toBe('bedingt')
  expect(hint.control).toContain('paths')
})

test('rule with globs but no paths warns as always-on', () => {
  const hint = classifyLoad(RULE_PATH, '~/.claude', { globs: '**/*.ts', frontmatter: 'description, globs' })
  expect(hint.when).toBe('immer')
  expect(hint.control).toContain('globs')
})
