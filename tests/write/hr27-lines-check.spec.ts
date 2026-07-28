// hr27-lines-check.spec.ts — Gate-Tests fuer scripts/hr27-lines-check.mjs (B14).
// Baseline-Semantik: bekannte Verletzungen warnen (Exit 0), NEUE Verletzungen
// lassen das Gate fehlschlagen (Exit 1). Cross-Test pinnt Limits/Skip-Liste
// zwischen Script-JSON und src/main/scan/hr27-scan.ts (keine dritte Kopie).
import { test, expect } from '@playwright/test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { HR27_LIMITS, HR27_SKIP_DIRS } from '../../src/main/scan/hr27-scan'

const SCRIPT = resolve(__dirname, '../../scripts/hr27-lines-check.mjs')
const REPO_ROOT = resolve(__dirname, '../..')
const BASELINE = join(REPO_ROOT, 'scripts', 'hr27-lines-baseline.json')

interface GateRun {
  status: number | null
  out: string
}

function runGate(args: string[]): GateRun {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}\n${r.stderr}` }
}

function seedLongFile(root: string, rel: string, lines: number): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, Array.from({ length: lines }, (_, i) => `const x${i} = ${i}`).join('\n'), 'utf8')
}

function writeBaseline(dir: string, known: Record<string, { lines: number; limit: number }>): string {
  const p = join(dir, 'baseline.json')
  writeFileSync(
    p,
    JSON.stringify({ limits: HR27_LIMITS, skipDirs: [...HR27_SKIP_DIRS], knownViolations: known }, null, 2),
    'utf8',
  )
  return p
}

test('B14: neue Zeilen-Verletzung laesst das Gate fehlschlagen (Exit 1)', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-hr27-gate-'))
  seedLongFile(root, 'src/too-long.ts', 301)
  const baseline = writeBaseline(root, {})
  const r = runGate(['--root', root, '--baseline', baseline])
  expect(r.status).toBe(1)
  expect(r.out).toContain('too-long.ts')
})

test('B14: in Baseline eingetragene Verletzung warnt nur (Exit 0)', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-hr27-gate-'))
  seedLongFile(root, 'src/alt-last.ts', 301)
  const baseline = writeBaseline(root, { 'src/alt-last.ts': { lines: 301, limit: 300 } })
  const r = runGate(['--root', root, '--baseline', baseline])
  expect(r.status).toBe(0)
  expect(r.out.toLowerCase()).toContain('warn')
})

test('B14: Datei im Limit und Skip-Dirs (out) loesen keinen Verstoss aus', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-hr27-gate-'))
  seedLongFile(root, 'src/im-limit.ts', 300)
  seedLongFile(root, 'out/main/artefakt.ts', 400)
  const baseline = writeBaseline(root, {})
  const r = runGate(['--root', root, '--baseline', baseline])
  expect(r.status).toBe(0)
})

test('B14: Repo-Lauf kennt nur bekannte Verletzungen (warn, Exit 0)', () => {
  const r = runGate([])
  expect(r.status).toBe(0)
})

test('B14: Script-Config und hr27-scan.ts teilen Limits und Skip-Liste', () => {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as {
    limits: Record<string, number>
    skipDirs: string[]
  }
  expect(baseline.limits).toEqual(HR27_LIMITS)
  expect([...baseline.skipDirs].sort()).toEqual([...HR27_SKIP_DIRS].sort())
})
