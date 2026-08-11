import { test, expect } from '@playwright/test'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configRoots } from '../../src/main/services/config-roots'
import { resolveIntegrations } from '../../src/main/services/integration-resolve'
import { handleStrukturScan } from '../../src/main/scan/struktur-scan'
import type { StrukturFinding } from '../../shared/contract-write'

// configRoots() liefert sharedClaude/projectRoot als string|null. Im Sandbox
// sind beide gesetzt — das sichert dieser Helfer explizit ab, statt die
// Null-Faelle mit `!` zu verschlucken.
function requireRoot(value: string | null, name: string): string {
  expect(value, `${name} ist im Sandbox nicht gesetzt`).not.toBeNull()
  return value as string
}

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
    const sharedClaude = requireRoot(roots.sharedClaude, 'sharedClaude')
    const projectRoot = requireRoot(roots.projectRoot, 'projectRoot')
    mkdirSync(join(sharedClaude, 'rules'), { recursive: true })
    mkdirSync(join(projectRoot, '.claude', 'skills'), { recursive: true })
    mkdirSync(join(projectRoot, '.codex', 'agents'), { recursive: true })

    const result = handleStrukturScan(undefined)

    expect(result.error).toBeNull()
    expect(result.data?.findings).toBeDefined()
    const findings: StrukturFinding[] = result.data?.findings ?? []
    const nestedWarnings = findings.filter((finding: StrukturFinding) =>
      [sharedClaude, join(projectRoot, '.claude'), join(projectRoot, '.codex')]
        .includes(finding.path)
    )
    expect(nestedWarnings).toEqual([])
  })
})

test('Direktes Projekte/.claude bleibt bekannter PC-Legacy-Kontext mit warn', () => {
  withSandbox((sandbox) => {
    mkdirSync(join(sandbox, '.claude'), { recursive: true })

    const result = handleStrukturScan(undefined)

    const finding = result.data?.findings.find((item: StrukturFinding) => item.path === join(sandbox, '.claude'))
    expect(finding).toMatchObject({
      status: 'warn',
      root: 'Projekte',
      kind: '.claude'
    })
    expect(finding?.note).toContain('bekannter PC-/Legacy-Kontext')
  })
})

// F7: Unter dem registrierten Workspace-Parent ist die normale WS-Struktur
// (<WS>/.claude, <WS>/.codex, <WS>/skills …) ERWARTET. Vorher meldete der Scan
// sie flaechendeckend als „tief verschachtelt" — jeder Workspace erzeugte
// Warnungen fuer seinen Regelaufbau.
test('registrierter WS-Parent erzeugt fuer Standard-WS-Struktur KEINE Warnungen', () => {
  withSandbox((sandbox) => {
    const roots = configRoots()
    mkdirSync(requireRoot(roots.sharedClaude, 'sharedClaude'), { recursive: true })
    // Ein Workspace, der NICHT in der Registry steht (Registry fehlt im Sandbox).
    const ws = join(sandbox, 'FremderWorkspace')
    for (const dir of ['.claude', '.codex', '.agents', '.kimi-code', 'skills', 'rules']) {
      mkdirSync(join(ws, dir), { recursive: true })
    }

    const result = handleStrukturScan(undefined)
    const findings: StrukturFinding[] = (result.data?.findings ?? [])
      .filter((f: StrukturFinding) => f.path.startsWith(ws))

    expect(findings.length).toBeGreaterThan(0)
    // Keine Warnung/Fehlplatzierung/Duplikat — alles „ok" mit Erwartet-Hinweis.
    expect(findings.filter((f: StrukturFinding) => f.status !== 'ok')).toEqual([])
    expect(findings.every((f: StrukturFinding) => (f.note ?? '').startsWith('Erwartet:'))).toBe(true)
  })
})

test('Shared-Trunk Integration findet configRoots().sharedClaude im Sandbox-Default', () => {
  withSandbox(() => {
    const roots = configRoots()
    const sharedClaude = requireRoot(roots.sharedClaude, 'sharedClaude')
    mkdirSync(sharedClaude, { recursive: true })

    const shared = resolveIntegrations().find((item) => item.id === 'shared-trunk')

    expect(shared?.root).toBe(sharedClaude)
    expect(shared?.availability).not.toBe('notConfigured')
    expect(['found', 'active']).toContain(shared?.availability)
  })
})
