import { test, expect } from '@playwright/test'
import { MESSAGE_PARAM_NAMES, msg } from '../../shared/messages'

test('overview focus messages explain unknown and routed diagnosis targets', () => {
  expect(msg('diagnostics.target.unknown', { source: 'Systemprüfung' })).toBe(
    'Kein konkreter Eintrag bekannt: Systemprüfung'
  )
  expect(msg('diagnostics.focus.title')).toBe('Geöffnet wegen Diagnose')
  expect(msg('diagnostics.focus.target', { target: 'Codex Changelog' })).toBe(
    'Ziel: Codex Changelog'
  )
})

test('overview focus message params are typed', () => {
  expect(MESSAGE_PARAM_NAMES['diagnostics.target.unknown']).toEqual(['source'])
  expect(MESSAGE_PARAM_NAMES['diagnostics.focus.title']).toEqual([])
  expect(MESSAGE_PARAM_NAMES['diagnostics.focus.target']).toEqual(['target'])
})

// WP-5: Die Erklaerbox der Zielseite sagt in EINEM Satz, warum man hier gelandet
// ist — auch wenn der Sprung aus einem gefuehrten Kernflow kam.
test('guided flow focus reasons answer why the user landed here in one sentence', () => {
  const reasons = [
    msg('guidedFlows.firstStart.reason'),
    msg('guidedFlows.checkProblem.reason'),
    msg('guidedFlows.checkProblem.reason.card', { target: 'cache (Plugins)' }),
    msg('guidedFlows.prepareChange.reason'),
    msg('guidedFlows.activateModule.reason'),
    msg('guidedFlows.symptom.reason', { target: 'Codex Changelog' })
  ]
  for (const reason of reasons) {
    expect(reason).toContain('Du bist hier, weil')
    expect(reason.split('.').filter((part) => part.trim() !== '')).toHaveLength(1)
  }
  expect(reasons[2]).toContain('cache (Plugins)')
  expect(reasons[5]).toContain('Codex Changelog')
})
