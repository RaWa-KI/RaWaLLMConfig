import { test, expect } from '@playwright/test'
import { deMessages, enMessages, msg } from '../../shared/messages'

test('guided flows describe four routed orchestration steps', () => {
  const flowIds = ['firstStart', 'checkProblem', 'prepareChange', 'activateModule'] as const
  for (const id of flowIds) {
    expect(deMessages[`guidedFlows.${id}.body`]).toMatch(/Flow/)
    expect(deMessages[`guidedFlows.${id}.target`].length).toBeGreaterThan(4)
    expect(enMessages[`guidedFlows.${id}.body`].length).toBeGreaterThan(20)
    expect(enMessages[`guidedFlows.${id}.target`].length).toBeGreaterThan(4)

    for (const step of ['one', 'two', 'three', 'four'] as const) {
      expect(deMessages[`guidedFlows.${id}.step.${step}`].length).toBeGreaterThan(12)
      expect(enMessages[`guidedFlows.${id}.step.${step}`].length).toBeGreaterThan(12)
    }
  }
  expect(msg('guidedFlows.backToDetails', { target: 'Module' })).toBe('Zu Module')
  expect(msg('guidedFlows.symptomTitle')).toBe('Aktuelle Symptome')
})
