import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDuplicates } from '../../src/main/services/dedupe'
import { scanHr27 } from '../../src/main/scan/hr27-scan'
import { collectMemoryFiles } from '../../src/main/scan/memory-audit'
import { makeSandbox, seedFile } from './fixtures'
import type { Category, ConfigEntry, LlmConfig } from '../../shared/contract'

function mkEntry(id: string, name: string, absPath: string): ConfigEntry {
  return { id, name, status: 'active', scope: 'global', path: absPath, desc: '', updated: '2026-07-03' }
}

function mkCat(id: string, entries: ConfigEntry[]): Category {
  return { id, label: id, icon: 'x', path: '/virtual/' + id, blurb: '', entries }
}

function mkFamily(categories: Category[]): LlmConfig {
  return { categories, duplicates: [] }
}

test('A1-3: HR27 scanner reports 310-line TS file with limit 300', () => {
  const sb = makeSandbox()
  seedFile(sb, 'too-long.ts', Array.from({ length: 310 }, (_, i) => `const x${i} = ${i}`).join('\n'))
  const findings = scanHr27(sb.configDir)
  expect(findings).toHaveLength(1)
  expect(findings[0]).toMatchObject({ ext: 'ts', lines: 310, limit: 300, overshoot: 10 })
})

test('A1-4: memory audit compares MEMORY.md index with _memory folder', () => {
  const sb = makeSandbox()
  const agentDir = join(sb.configDir, 'agents', 'alpha')
  mkdirSync(join(agentDir, '_memory'), { recursive: true })
  writeFileSync(join(agentDir, 'MEMORY.md'), '- [_memory/foo.md]\n', 'utf8')
  writeFileSync(join(agentDir, '_memory', 'bar.md'), '# bar\n', 'utf8')
  const audit = collectMemoryFiles(agentDir)
  expect(audit.missingInIndex).toEqual(['bar.md'])
  expect(audit.missingOnDisk).toEqual(['foo.md'])
})

test('A1-7: same-family same-name files in different roots form heuristic duplicate set', () => {
  const sb = makeSandbox()
  const aDir = join(sb.configDir, 'ws-a', 'agents')
  const bDir = join(sb.configDir, 'ws-b', 'agents')
  mkdirSync(aDir, { recursive: true })
  mkdirSync(bDir, { recursive: true })
  const aPath = join(aDir, 'foo.md')
  const bPath = join(bDir, 'foo.md')
  writeFileSync(aPath, '# same\n', 'utf8')
  writeFileSync(bPath, '# same\n', 'utf8')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('agents', [mkEntry('a', 'foo', aPath), mkEntry('b', 'foo', bPath)])]),
  }
  findDuplicates(data)
  expect(data.claude.duplicates).toHaveLength(1)
  expect(data.claude.duplicates[0].confidence).toBe('heuristic')
  expect(data.claude.duplicates[0].verdict).toBe('same')
})

test('A1-7: named mirror duplicates keep named-mirror confidence', () => {
  const sb = makeSandbox()
  const mainPath = seedFile(sb, 'foo.md', '# same\n')
  const mirrorPath = seedFile(sb, 'foo-mirror.md', '# same\n')
  const data: Record<string, LlmConfig> = {
    claude: mkFamily([mkCat('agents', [mkEntry('a', 'foo', mainPath), mkEntry('b', 'foo', mirrorPath)])]),
  }
  findDuplicates(data)
  expect(data.claude.duplicates).toHaveLength(1)
  expect(data.claude.duplicates[0].confidence).toBe('named-mirror')
})
