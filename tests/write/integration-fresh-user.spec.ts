// integration-fresh-user.spec.ts -- MI-0 RED-Test fuer modulare Integrationen.
// Zielbild: Ein Fresh User ohne .shared bekommt keinen Shared-Defekt. Optionales
// Shared bleibt core-first ausgeblendet, statt als Platzhalter/Fehler zu wirken.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function bustScanCache(): void {
  for (const key of Object.keys(require.cache)) {
    const k = key.replace(/\\/g, '/')
    if (
      k.includes('/src/main/scan/') ||
      k.includes('/src/main/services/') ||
      k.includes('/shared/contract')
    ) {
      delete require.cache[key]
    }
  }
}

function loadScanAll(): () => { llms: Array<Record<string, unknown>>, data: Record<string, { scanError?: string }> } {
  bustScanCache()
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { scanAll } = require('../../src/main/scan/scan-index') as {
    scanAll: () => { llms: Array<Record<string, unknown>>, data: Record<string, { scanError?: string }> }
  }
  /* eslint-enable @typescript-eslint/no-var-requires */
  return scanAll
}

test('fresh user ohne .shared: shared bleibt ausgeblendet statt Scan-Fehler', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-fresh-user-'))
  mkdirSync(join(root, '.claude'))
  mkdirSync(join(root, '.codex'))
  mkdirSync(join(root, 'project'))
  delete process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = root

  try {
    const appData = loadScanAll()()
    const shared = appData.llms.find((l) => l.id === 'shared')

    expect(appData.data.shared?.scanError).toBeUndefined()
    expect(shared?.scanError).toBeUndefined()
    expect(shared).toBeUndefined()
    expect(appData.data.shared?.categories ?? []).toEqual([])
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
    bustScanCache()
  }
})
