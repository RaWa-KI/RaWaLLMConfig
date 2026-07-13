import { expect, test } from '@playwright/test'
import { sanitizeDiagnosticReport, sanitizeErrorReportRequest } from '../../shared/contract-diagnostics'

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

test('diagnostics report normalisierung schreibt nur erlaubte Felder', () => {
  const report = sanitizeDiagnosticReport({
    kind: 'renderer-error',
    app: { name: 'RaWaLLMConfig', version: '0.1.4' },
    runtime: { platform: 'win32', electron: '42', chrome: '1', node: '2' },
    timestamp: '2026-07-08T00:00:00.000Z',
    error: { message: 'kaputt', source: 'renderer', componentStack: null },
    screenshotDataUrl: `data:image/png;base64,${'a'.repeat(2_000_001)}`
  })
  expect(report.screenshotDataUrl).toBeNull()
  expect(Object.keys(report)).toEqual(['kind', 'app', 'runtime', 'timestamp', 'error', 'screenshotDataUrl'])
})
