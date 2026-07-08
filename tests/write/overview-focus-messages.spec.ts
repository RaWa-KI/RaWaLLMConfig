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
