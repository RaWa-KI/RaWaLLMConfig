// scan-error-signal.spec.ts — A8-1: ein gecrashter Familien-Scan erzeugt ein
// SICHTBARES Fehler-Signal (LlmConfig.scanError) statt einer leeren Familie, die
// ununterscheidbar von "nichts konfiguriert" waere. Zwei Ebenen:
//  (1) scanProvider() setzt scanError, wenn eine Kategorie (hier eine
//      CustomCategory) wirft — categories bleibt leer, scanError traegt die msg.
//  (2) buildLlms() entkoppelt coming von scanError: eine Familie mit scanError
//      ist NICHT 'coming' (bleibt klickbar) und reicht scanError durch.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
// Secret-frei: nur eine synthetische 'boom'-Fehlermeldung.
import { test, expect } from '@playwright/test'
import type { LlmConfig } from '../../shared/contract'
import type { ProviderManifest } from '../../shared/contract-provider'
import { scanProvider } from '../../src/main/scan/engine/scan-engine'
import { buildLlms } from '../../src/main/scan/scan-index'

// Manifest ohne Roots (metadaten-only) mit EINER CustomCategory, deren custom()
// hart wirft. Kein Endpoint -> categories bleibt leer, sobald die Kategorie crasht.
function throwingManifest(): ProviderManifest {
  return {
    id: 'test',
    label: 'Test-Provider',
    roots: [],
    categories: [
      {
        custom: () => {
          throw new Error('boom')
        },
      },
    ],
    capabilities: ['secret-guarded'],
  }
}

test('scanProvider: crashende Kategorie -> leere categories + sichtbarer scanError', () => {
  const res = scanProvider(throwingManifest())
  expect(res.categories.length).toBe(0)
  expect(res.scanError).toBeDefined()
  expect(res.scanError).toContain('boom')
})

test('buildLlms: Familie mit scanError ist nicht coming und reicht scanError durch', () => {
  const data: Record<string, LlmConfig> = {
    claude: { categories: [], duplicates: [], scanError: 'x' },
  }
  const defs = buildLlms(data)
  const claude = defs.find((d) => d.id === 'claude')!
  expect(claude.scanError).toBe('x')
  // Entkoppelt: trotz leerer Familie NICHT 'coming' (bleibt klickbar).
  expect(claude.coming).toBe(false)
})

test('buildLlms: leere Familie OHNE scanError bleibt coming (Regression)', () => {
  const data: Record<string, LlmConfig> = {
    claude: { categories: [], duplicates: [] },
  }
  const claude = buildLlms(data).find((d) => d.id === 'claude')!
  expect(claude.coming).toBe(true)
  expect(claude.scanError).toBeUndefined()
})
