// integration-fresh-user.spec.ts -- MI-0 RED-Test fuer modulare Integrationen.
// Zielbild: Ein Fresh User ohne .shared bekommt keinen Shared-Defekt. Optionales
// Shared bleibt core-first ausgeblendet, statt als Platzhalter/Fehler zu wirken.
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanAll } from '../../src/main/scan/scan-index'

// Statischer Import statt require + Cache-Bust: scan-index loest seine Wurzeln
// bei JEDEM Aufruf ueber configRoots() auf (reine Funktion von
// RAWALLM_SANDBOX_ROOT) — kein Root-Freeze beim Modul-Load mehr.

test('fresh user ohne .shared: shared bleibt ausgeblendet statt Scan-Fehler', () => {
  const root = mkdtempSync(join(tmpdir(), 'rawallm-fresh-user-'))
  mkdirSync(join(root, '.claude'))
  mkdirSync(join(root, '.codex'))
  mkdirSync(join(root, 'project'))
  delete process.env.RAWALLM_SANDBOX_ROOT
  process.env.RAWALLM_SANDBOX_ROOT = root

  try {
    const appData = scanAll()
    const shared = appData.llms.find((l) => l.id === 'shared')

    expect(appData.data.shared?.scanError).toBeUndefined()
    expect(shared?.scanError).toBeUndefined()
    expect(shared).toBeUndefined()
    expect(appData.data.shared?.categories ?? []).toEqual([])
  } finally {
    delete process.env.RAWALLM_SANDBOX_ROOT
    rmSync(root, { recursive: true, force: true })
  }
})
