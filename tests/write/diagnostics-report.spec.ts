import { expect, test } from '@playwright/test'
import { sanitizeErrorReportRequest } from '../../shared/contract-diagnostics'

test('diagnostics sanitizer kappt message und entfernt lokale Pfade', () => {
  const request = sanitizeErrorReportRequest({
    message: `C:\\Workspace\\Mein Projekt\\config.json ${'a'.repeat(300)}`,
    source: 'renderer',
    componentStack: '\\\\MONAPC\\Users\\ramon\\app.tsx > /home/ramon/config.ts'
  })
  expect(request.message).toContain('[lokaler-pfad]')
  expect(String(request.message).length).toBeLessThanOrEqual(240)
  expect(request.message).not.toContain('ramon')
  expect(request.message).not.toContain('config.json')
  expect(request.componentStack).not.toContain('MONAPC')
  expect(request.componentStack).not.toContain('/home/ramon')
})

test('diagnostics sanitizer erzeugt minimalen request ohne stack dump', () => {
  const request = sanitizeErrorReportRequest({ stack: 'nicht erlaubt' })
  expect(request.message).toBe('Unbekannter Fehler')
  expect(request.source).toBe('renderer')
  expect(request.componentStack).toBe('')
  expect('stack' in request).toBe(false)
})
