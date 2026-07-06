// source-discovery.spec.ts — Auto-Discovery der Standard-Homes (WP-C3). Beweist:
// (a) ueber opts.home auf ein temp-Verzeichnis mit .claude + .ollama (aber OHNE
// .codex) liefert genau claude + local(ollama), NICHT codex; root/providerId/label
// stimmen. (b) leeres/nicht-existentes home -> []. Reine Node-Service-Tests gegen
// temp-Verzeichnisse (Playwright nur als Runner, kein Browser).
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { discoverSources } from '../../src/main/services/source-discovery'

function clearEnv(): void {
  delete process.env.RAWALLM_SANDBOX_ROOT
}

test('(a) home mit .claude + .ollama (ohne .codex) -> nur claude + local(ollama)', () => {
  clearEnv()
  const home = mkdtempSync(join(tmpdir(), 'rawallm-disco-'))
  mkdirSync(join(home, '.claude'))
  mkdirSync(join(home, '.ollama'))
  // .codex bewusst NICHT anlegen.
  const hits = discoverSources({ home })

  // Genau zwei Treffer; codex fehlt.
  expect(hits.map((h) => h.providerId).sort()).toEqual(['claude', 'local'])
  expect(hits.some((h) => h.label.includes('Codex'))).toBe(false)

  const claude = hits.find((h) => h.providerId === 'claude')
  expect(claude?.root).toBe(join(home, '.claude'))
  expect(claude?.label).toBe('Claude (~/.claude)')

  const ollama = hits.find((h) => h.label.includes('Ollama'))
  expect(ollama?.providerId).toBe('local')
  expect(ollama?.root).toBe(join(home, '.ollama'))
  expect(ollama?.label).toBe('Ollama (~/.ollama)')
  clearEnv()
})

test('(b) leeres home (keine Standard-Ordner) -> []', () => {
  clearEnv()
  const home = mkdtempSync(join(tmpdir(), 'rawallm-disco-empty-'))
  expect(discoverSources({ home })).toEqual([])
  clearEnv()
})

test('(b) nicht-existentes home -> [] (graceful, kein Throw)', () => {
  clearEnv()
  const home = join(tmpdir(), 'rawallm-disco-does-not-exist-xyz123')
  expect(discoverSources({ home })).toEqual([])
  clearEnv()
})
