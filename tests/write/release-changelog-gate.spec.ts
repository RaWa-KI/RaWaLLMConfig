import { test, expect } from '@playwright/test'

test('bilingual release notes pass the language gate', async () => {
  const gate = await import('../../scripts/release/changelog-gate.mjs')
  const body = [
    '# RaWaLLMConfig 0.1.3',
    '',
    '## Deutsch',
    '',
    '- Oeffentliche Releases bleiben die Standardquelle fuer App-Updates.',
    '- Die Pruefung zeigt verstaendliche Hinweise, wenn eine Quelle nicht erreichbar ist.',
    '',
    '## English',
    '',
    '- Public GitHub releases remain the default source for app updates.',
    '- The update flow shows clearer states when a source is not reachable.'
  ].join('\n')

  expect(gate.validateGermanReleaseNotes(body)).toEqual([])
})

test('German-only release notes fail the bilingual gate', async () => {
  const gate = await import('../../scripts/release/changelog-gate.mjs')
  const body = [
    '# RaWaLLMConfig 0.1.3',
    '',
    '## Deutsch',
    '',
    '- Oeffentliche Releases bleiben die Standardquelle fuer App-Updates.',
    '- Die Pruefung zeigt verstaendliche Hinweise, wenn eine Quelle nicht erreichbar ist.'
  ].join('\n')

  expect(gate.validateGermanReleaseNotes(body)).toContain(
    'RELEASE_NOTES.md braucht einen Abschnitt "## English".'
  )
})

test('chat approval must be explicit', async () => {
  const gate = await import('../../scripts/release/changelog-gate.mjs')

  expect(gate.isChatApproved({ RAWALLM_CHANGELOG_CHAT_APPROVED: '1' })).toBe(true)
  expect(gate.isChatApproved({ RAWALLM_CHANGELOG_CHAT_APPROVED: 'true' })).toBe(false)
  expect(gate.buildReleaseNotesPreview('0.1.3', '# RaWaLLMConfig 0.1.3\n\n- Test')).toContain(
    'CHAT-VORSCHAU'
  )
})
