// explain.spec.ts — regelbasierte "Was macht das?"-Erklaerung. Deterministisch,
// laienverstaendlich, OHNE Secret/Code. Reine Funktionstests, kein fs-Mutate.
import { test, expect } from '@playwright/test'
import { explain } from '../../src/main/services/explain'

test('Hook-Entry wird laienverstaendlich erklaert (ohne Code/Secret)', () => {
  const res = explain({ kind: 'hook', name: 'claude-block-destructive-ops' })
  expect(res.error).toBeNull()
  expect(res.data).not.toBeNull()
  expect(res.data!.text.toLowerCase()).toContain('automatisch')
  // Gehoert zur Familie Claude Code (Praefix-Schema).
  expect(res.data!.text).toContain('Claude Code')
  // Kein Code-/Secret-Leak im Text.
  expect(res.data!.text).not.toMatch(/secret|password|token|api[_-]?key|\bkey\b/i)
})

test('Rule/Skill/Agent/Plugin erhalten je eine eigene Erklaerung', () => {
  for (const kind of ['rule', 'skill', 'agent', 'plugin']) {
    const res = explain({ kind, name: `claude-${kind}-x` })
    expect(res.error).toBeNull()
    expect(res.data!.text.length).toBeGreaterThan(20)
  }
})

test('unbekannter Typ -> generischer Fallback (nie leer)', () => {
  const res = explain({ kind: 'voellig-unbekannt', name: 'irgendwas' })
  expect(res.error).toBeNull()
  expect(res.data!.text.length).toBeGreaterThan(10)
  expect(res.data!.title).toBeTruthy()
})

test('invalid request -> error, kein Crash', () => {
  // @ts-expect-error absichtlich falscher Typ fuer Robustheits-Test
  const res = explain({ kind: 123 })
  expect(res.data).toBeNull()
  expect(res.error).toBe('invalid-request')
})

test('Familien-Praefix wird korrekt zugeordnet (codex/llm/mcp/shared/sys)', () => {
  const cases: [string, string][] = [
    ['codex-config', 'Codex'],
    ['llm-qwen3-8b', 'lokale Sprachmodelle'],
    ['mcp-playwright', 'MCP'],
    ['shared-rules', 'Trunk'],
    ['sys-node', 'System-Umgebung']
  ]
  for (const [name, expected] of cases) {
    const res = explain({ kind: name.split('-')[0], name })
    expect(res.data!.text, name).toContain(expected)
  }
})
