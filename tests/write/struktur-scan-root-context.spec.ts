import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configRoots } from '../../src/main/services/config-roots'
import { resolveIntegrations } from '../../src/main/services/integration-resolve'
import { handleStrukturScan } from '../../src/main/scan/struktur-scan'

function withSandbox<T>(fn: (sandbox: string) => T): T {
  const previous = process.env.RAWALLM_SANDBOX_ROOT
  const sandbox = mkdtempSync(join(tmpdir(), 'rawallm-struktur-context-'))
  process.env.RAWALLM_SANDBOX_ROOT = sandbox
  try {
    return fn(sandbox)
  } finally {
    if (previous == null) {
      delete process.env.RAWALLM_SANDBOX_ROOT
    } else {
      process.env.RAWALLM_SANDBOX_ROOT = previous
    }
  }
}

test('Projekte-Parent meldet erwartete Shared- und Workspace-Kontexte nicht tief verschachtelt', () => {
  withSandbox(() => {
    const roots = configRoots()
    mkdirSync(join(roots.sharedClaude, 'rules'), { recursive: true })
    mkdirSync(join(roots.projectRoot, '.claude', 'skills'), { recursive: true })
    mkdirSync(join(roots.projectRoot, '.codex', 'agents'), { recursive: true })

    const result = handleStrukturScan(undefined)

    expect(result.error).toBeNull()
    expect(result.data?.findings).toBeDefined()
    const findings = result.data?.findings ?? []
    const nestedWarnings = findings.filter((finding) =>
      [roots.sharedClaude, join(roots.projectRoot, '.claude'), join(roots.projectRoot, '.codex')]
        .includes(finding.path)
    )
    expect(nestedWarnings).toEqual([])
  })
})

test('Direktes Projekte/.claude bleibt bekannter PC-Legacy-Kontext mit warn', () => {
  withSandbox((sandbox) => {
    mkdirSync(join(sandbox, '.claude'), { recursive: true })

    const result = handleStrukturScan(undefined)

    const finding = result.data?.findings.find((item) => item.path === join(sandbox, '.claude'))
    expect(finding).toMatchObject({
      status: 'warn',
      root: 'Projekte',
      kind: '.claude'
    })
    expect(finding?.note).toContain('bekannter PC-/Legacy-Kontext')
  })
})

test('Shared-Trunk Integration findet configRoots().sharedClaude im Sandbox-Default', () => {
  withSandbox(() => {
    const roots = configRoots()
    mkdirSync(roots.sharedClaude, { recursive: true })

    const shared = resolveIntegrations().find((item) => item.id === 'shared-trunk')

    expect(shared?.root).toBe(roots.sharedClaude)
    expect(shared?.availability).not.toBe('notConfigured')
    expect(['found', 'active']).toContain(shared?.availability)
  })
})
