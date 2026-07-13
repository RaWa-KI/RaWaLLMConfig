// error-boundary.spec.ts — A8-6: reine LOGIK-Pruefung der ErrorBoundary-State-Ableitung (Stufe 2).
// DOM-frei: testet nur die statische getDerivedStateFromError-Ableitung, die den
// Fallback-State aus dem geworfenen Fehler bildet. Es wird NICHTS gemountet.
//
// WICHTIG (Scope-Grenze): Der End-to-End-PASS von A8-6 ("weisses Fenster wird
// verhindert") verlangt zusaetzlich einen BROWSER-SMOKE gegen den echten Build
// (Render-Throw provozieren -> Fallbackseite sichtbar). Das ist ein
// browser-basierter Schritt und gehoert NICHT in diesen Node-Runner — hier wird
// die ErrorBoundary bewusst nicht in einen DOM gemountet.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
import { expect, test } from '@playwright/test'
import {
  buildErrorReportRequest,
  deriveErrorBoundaryState,
  sanitizeComponentStack
} from '../../src/renderer/components/error-boundary-state'

test('getDerivedStateFromError: Error -> hasError=true + gekappte message', () => {
  const state = deriveErrorBoundaryState(new Error('x'))
  expect(state.hasError).toBe(true)
  expect(state.msg).toBe('x')
  expect(state.reportBusy).toBe(false)
})

test('getDerivedStateFromError: Nicht-Error -> hasError=true + Fallback-Text', () => {
  const state = deriveErrorBoundaryState('kaputt')
  expect(state.hasError).toBe(true)
  expect(state.msg).toBe('Unbekannter Fehler')
})

test('report request enthaelt nur sanitisierte Kurzfelder', () => {
  const state = deriveErrorBoundaryState(new Error('kaputt C:\\Workspace\\secret.txt'))
  state.componentStack = sanitizeComponentStack('App (C:\\Workspace\\app.tsx:1:1)')
  const req = buildErrorReportRequest(state)
  expect(req.message).toContain('[lokaler-pfad]')
  expect(req.componentStack).toContain('[lokaler-pfad]')
  expect('stack' in req).toBe(false)
})
