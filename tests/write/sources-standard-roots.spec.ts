// sources-standard-roots.spec.ts — WP-6 (B8): Die Auto-Discovery darf die
// Basis-Roots (configRoots()) NICHT als zusaetzliche Quelle vorschlagen — sie
// werden ohnehin gelesen, ein Uebernahme-Vorschlag verwirrt nur. Fremde Ordner
// (gleicher Name, anderer Ort) bleiben Vorschlaege. Plus Source-Pins fuer die
// Renderer-Guidance (Standard-Markierung, Badge-Tooltip, Dialog-Intro).
// Reine Node-Service-Tests (Playwright nur als Runner, kein Browser).
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { discoverSources } from '../../src/main/services/source-discovery'

const TOOL_HOMES = ['.claude', '.codex', '.kimi-code', '.ollama', '.lmstudio']

function makeDirs(prefix: string, dirs: string[]): string {
  const base = mkdtempSync(join(tmpdir(), prefix))
  for (const d of dirs) mkdirSync(join(base, d), { recursive: true })
  return base
}

test.afterEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
})

// (a) Sandbox-Modus: configRoots() = <sandbox>/.claude + <sandbox>/.codex
// (+ shared/project). Genau diese beiden duerfen NICHT mehr vorgeschlagen
// werden; Kimi/Ollama/LM-Studio sind keine Basis-Roots und bleiben.
test('(a) Basis-Roots (.claude/.codex via configRoots()) -> kein Uebernahme-Vorschlag', () => {
  const sandbox = makeDirs('rawallm-std-roots-', [...TOOL_HOMES, '.shared/.claude', 'project'])
  process.env.RAWALLM_SANDBOX_ROOT = sandbox

  const hits = discoverSources() // home loest auf den Sandbox-Root auf
  const roots = hits.map((h) => h.root)

  expect(roots).not.toContain(join(sandbox, '.claude'))
  expect(roots).not.toContain(join(sandbox, '.codex'))
  expect(hits.map((h) => h.providerId)).toEqual(['kimi', 'local', 'local'])
})

// (b) Fremder Ordner: gleicher Unterordner-Name, aber ANDERER Ort als der
// Basis-Root -> kein Filter, der Vorschlag bleibt (Schutz gegen Over-Filter).
test('(b) fremder Ordner mit Standard-Namen bleibt Vorschlag', () => {
  const sandbox = makeDirs('rawallm-std-sb-', ['.claude', '.codex'])
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  const foreign = makeDirs('rawallm-std-foreign-', ['.claude', '.codex'])

  const hits = discoverSources({ home: foreign })
  expect(hits.map((h) => h.providerId)).toEqual(['claude', 'codex'])
  expect(hits[0]?.root).toBe(join(foreign, '.claude'))
})

// (c) Source-Pins (Muster drawer-first-click.spec.ts): Guidance-Verdrahtung im
// Renderer + Filter-Verdrahtung im Service bleiben bestehen.
test('(c) Source-Pin: Standard-Markierung, Badge-Tooltip, Dialog-Guidance, Filter', () => {
  const row = readFileSync(join(process.cwd(), 'src/renderer/sections/quellen/SourceRow.tsx'), 'utf8')
  expect(row).toContain('Standard — wird ohnehin gelesen')
  expect(row).toContain('Gelesen von:')

  const dlg = readFileSync(join(process.cwd(), 'src/renderer/sections/quellen/AddSourceDialog.tsx'), 'utf8')
  expect(dlg).toContain('Standard-Ordner')

  const disco = readFileSync(join(process.cwd(), 'src/main/services/source-discovery.ts'), 'utf8')
  expect(disco).toContain('configRoots')
})
