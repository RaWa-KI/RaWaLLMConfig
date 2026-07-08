import { test, expect } from '@playwright/test'
import { deMessages, MESSAGE_KEYS, msg } from '../../shared/messages'

const technicalWarningTerms = /Token|Frontmatter|Kontext|Skill-Roster/

test('config warnings explain meaning, importance, and safe action in everyday wording', () => {
  expect(MESSAGE_KEYS.some((key) => key.startsWith('configWarnings.'))).toBeTruthy()
  expect(msg('configWarnings.label.meaning')).toBe('Was bedeutet das?')
  expect(msg('configWarnings.label.importance')).toBe('Warum ist das wichtig?')
  expect(msg('configWarnings.label.action')).toBe('Was kann ich tun?')
  expect(msg('configWarnings.action.startLoadObserve')).toContain('Nur beobachten')

  for (const key of MESSAGE_KEYS.filter((item) => item.startsWith('configWarnings.meaning.'))) {
    expect(deMessages[key]).not.toMatch(technicalWarningTerms)
  }
})
