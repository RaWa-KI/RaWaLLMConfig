// kimi-family.spec.ts — WP-10 (HR16-Paritaet): ~/.kimi-code ist eine vollwertige
// Familie. Beweist gegen eine geseedete <sandbox>/.kimi-code:
//   (1) Discovery findet das Tool-Home mit providerId 'kimi',
//   (2) die Familie 'kimi' ist mit allen 5 Kategorien befuellt,
//   (3) userglobal uebernimmt die Kimi-Kategorien (Werkzeug-Feld),
//   (4) config.toml wird NUR maskiert getragen (kein Wert),
//   (5) credentials/ wird NUR klassifiziert: kein Dateiname, kein Wert, keine
//       Vorschau, keine searchKeys — nur Ordner-Metadaten (Existenz + Anzahl).
// MECHANIK wie builddata-equivalence: RAWALLM_SANDBOX_ROOT wird VOR dem Require
// gesetzt und der Scan-Subtree-Cache verworfen, damit die modul-gebundenen
// *Dir-Konstanten unter der Sandbox neu aufgeloest werden.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LlmConfig } from '../../shared/contract'
import { discoverSources } from '../../src/main/services/source-discovery'

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (k.includes('/src/main/scan/') || k.includes('/src/main/services/') || k.includes('/shared/contract')) {
      delete require.cache[key]
    }
  }
}

function loadBuildData(): () => Record<string, LlmConfig> {
  bustScanCache()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const idx = require('../../src/main/scan/scan-index') as { buildData: () => Record<string, LlmConfig> }
  return idx.buildData
}

function w(file: string, content: string): void {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content, 'utf8')
}

// Testwerte sind synthetisch (keine echten Secrets, keine Privatpfade).
const TOML_WERT = 'synthetischer-toml-wert-123'
const CRED_WERT = 'synthetischer-cred-wert-456'

function seedKimi(root: string): string {
  const kimi = join(root, '.kimi-code')
  w(join(kimi, 'AGENTS.md'), '# Kimi Startanker\n\nText.\n')
  w(join(kimi, 'config.toml'), `[profile]\nmodel = "x"\napi_key = "${TOML_WERT}"\n`)
  w(join(kimi, 'workspaces.json'), JSON.stringify({ workspaces: {} }, null, 2))
  w(join(kimi, 'hooks', 'guard.mjs'), '// kimi hook\nexport default {}\n')
  w(join(kimi, 'credentials', 'kimi-code.json'), JSON.stringify({ access_token: CRED_WERT }, null, 2))
  return kimi
}

let sandboxRoot = ''
test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-kimi-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandboxRoot
})
test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
  // Cache erneut verwerfen, NACHDEM die Env entfernt ist (sonst bleiben die
  // Scan-Module an den geloeschten Sandbox-Pfad gebunden).
  bustScanCache()
  try {
    rmSync(sandboxRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// (1) Discovery: das Tool-Home wird ueberhaupt gefunden.
test('(1) discoverSources findet ~/.kimi-code als providerId kimi', () => {
  const home = mkdtempSync(join(tmpdir(), 'rawallm-kimi-home-'))
  mkdirSync(join(home, '.kimi-code'))
  const hit = discoverSources({ home }).find((h) => h.providerId === 'kimi')
  expect(hit?.root).toBe(join(home, '.kimi-code'))
  expect(hit?.label).toBe('Kimi (~/.kimi-code)')
})

// (2)-(5) Scan-Ergebnis.
test('(2-5) Familie kimi befuellt, userglobal uebernimmt, credentials nur klassifiziert', () => {
  seedKimi(sandboxRoot)
  const data = loadBuildData()()

  // (2) alle 5 Kategorien in fixer Reihenfolge, jede real befuellt.
  const cats = data.kimi?.categories ?? []
  expect(cats.map((c) => c.id)).toEqual([
    'kimi-instructions', 'kimi-settings', 'kimi-credentials', 'kimi-hooks', 'kimi-workspaces',
  ])
  const count = (id: string): number => cats.find((c) => c.id === id)?.entries.length ?? -1
  expect(count('kimi-instructions'), 'AGENTS.md fehlt').toBeGreaterThan(0)
  expect(count('kimi-settings'), 'config.toml fehlt').toBeGreaterThan(0)
  expect(count('kimi-hooks'), 'Hook-Skript fehlt').toBeGreaterThan(0)
  expect(count('kimi-workspaces'), 'workspaces.json fehlt').toBeGreaterThan(0)

  // (3) userglobal-Sicht mit Werkzeug-Kennzeichnung.
  const userKimi = (data.userglobal?.categories ?? []).filter((c) => c.id.startsWith('userglobal-kimi-'))
  expect(userKimi.length, 'userglobal ohne Kimi-Kategorien').toBeGreaterThan(0)
  expect(userKimi[0].entries[0].fields?.Werkzeug).toBe('Kimi')

  // (4)+(5) kein Secret-Wert, kein credentials-Dateiname im gesamten Ergebnis.
  const dump = JSON.stringify(data)
  expect(dump, 'config.toml-Wert im Ergebnis').not.toContain(TOML_WERT)
  expect(dump, 'credentials-Wert im Ergebnis').not.toContain(CRED_WERT)
  expect(dump, 'credentials-Dateiname im Ergebnis').not.toContain('kimi-code.json')

  // (5) credentials: genau EIN Ordner-Eintrag, ohne Vorschau/searchKeys.
  const cred = cats.find((c) => c.id === 'kimi-credentials')
  expect(cred?.entries.length).toBe(1)
  expect(cred?.entries[0].name).toBe('credentials')
  expect(cred?.entries[0].code).toBeUndefined()
  expect(cred?.entries[0].searchKeys).toBeUndefined()
  expect(cred?.entries[0].fields?.Dateien).toBe('1')
})
