// scan-scope-migration-gate.spec.ts — WP-7 Pflicht-Gate aus
// PLAN-rawallmconfig-smoke-fixpaket2_2026-07-27: „Scan-Umfang unveraendert"
// nach Integration WP-11 (Audit-Wurzeln) + WP-12 (Wurzelmodell-Migration),
// bewiesen auf diesem Rechner.
//
// (1) Wurzel-Mengen-Gleichheit: der historische Algorithmus (Commit 2df5fb4,
//     vor Fixpaket 2: realRoots() mit Desktop/Projekte-Hartcode) wird als
//     Wertetabelle festgehalten und gegen die NEUE Aufloesung mit leeren Prefs
//     (lazy Legacy-Seed, wie sie auf Bestandsinstallationen laeuft) verglichen
//     — die Werte muessen byte-identisch bleiben.
// (2) Vollscan-Nachher-Dump (Kategorien/Eintraege je Familie + verwendete
//     Wurzeln) als Evidenz-JSON unter tests/audit-runtime/wp7-scan-umfang/,
//     dazu Determinismus (zwei Scans, identische Zahlen).
// Gewollte Zaehler-Deltas dieses Pakets (keine Regressionen): WP-2 Dedupe
// (Kategorien x3 -> x1), WP-11 Buendelung (Audit-Details -> 1 Summary je
// Kategorie) + leere Soll-Kategorien sichtbar, WP-8 Kimi-Familie im
// Quervergleich. Maschinengebunden: ohne Legacy-Pfade -> SKIP (Fremd-Setup).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import { scanAll } from '../../src/main/scan/scan-index'
import {
  configRoots, configWatchRootList, workspaceRoots
} from '../../src/main/services/config-roots'
import { discoverConfigRoots } from '../../src/main/services/config-root-resolution'
import type { Category } from '../../shared/contract'

// Historische Vor-Fix-Wurzeln, exakt der Algorithmus aus Commit 2df5fb4
// (config-root-resolution.ts realRoots(), Desktop/Projekte-Hartcode).
function vorFixRoots(): {
  claudeHome: string; codexHome: string; sharedClaude: string; projectRoot: string
} {
  const home = homedir()
  return {
    claudeHome: join(home, '.claude'),
    codexHome: join(home, '.codex'),
    sharedClaude: join(home, 'Desktop', 'Projekte', '.shared', '.claude'),
    projectRoot: join(home, 'Desktop', 'Projekte', 'RaWaLLMConfig')
  }
}

const vorher = vorFixRoots()
const hatLegacyPfade = existsSync(vorher.sharedClaude) && existsSync(vorher.projectRoot)

test.beforeEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
})

// Explizite Injection statt Modul-Global-Seams (debugging.md 2026-07-28):
// leere Prefs = Bestandsinstallation VOR dem ersten Start der neuen Version
// (lazy Migration-Seed greift, genau wie nach der persistenten Migration);
// existsSync = Produktions-Existenzpruefung auf dieser Maschine.
const gateDeps = { prefs: {}, exists: existsSync }

test('WP-7-Gate: Wurzel-Mengen vorher/nachher byte-identisch (Migration)', () => {
  test.skip(!hatLegacyPfade, 'keine Bestandsinstallation mit Legacy-Pfaden (Fremd-Setup)')
  const discovered = discoverConfigRoots(gateDeps.prefs, gateDeps.exists)
  expect(discovered.sharedClaude.value).toBe(vorher.sharedClaude)
  expect(discovered.projectRoot.value).toBe(vorher.projectRoot)
  expect(discovered.workspaceParent.value).toBe(join(homedir(), 'Desktop', 'Projekte'))
  const roots = configRoots(gateDeps)
  expect(roots.claudeHome).toBe(vorher.claudeHome)
  expect(roots.codexHome).toBe(vorher.codexHome)
  expect(roots.sharedClaude).toBe(vorher.sharedClaude)
  expect(roots.projectRoot).toBe(vorher.projectRoot)
  // Watcher-/Scan-Basis: dieselben vier Wurzeln wie vor dem Paket.
  expect(configWatchRootList(gateDeps)).toEqual([
    vorher.claudeHome, vorher.codexHome, vorher.sharedClaude, vorher.projectRoot
  ])
})

test('WP-7-Gate: workspaceRoots unveraendert (Parent + Registry, nur Label neu)', () => {
  test.skip(!hatLegacyPfade, 'keine Bestandsinstallation mit Legacy-Pfaden (Fremd-Setup)')
  // workspaceRoots laeuft bewusst ueber den Produktionspfad (Default-Provider
  // = leere Prefs + echter fs-Check) — das Gate misst die reale Aufloesung.
  const ws = workspaceRoots()
  expect(ws.length).toBeGreaterThan(0)
  expect(ws[0]!.root).toBe(join(homedir(), 'Desktop', 'Projekte'))
  expect(ws[0]!.label).toBe('Projektordner') // war „Projekte (Parent)" — gewollt
})

test('WP-7-Gate: Vollscan nachher vollstaendig + deterministisch + Evidenz-Dump', () => {
  test.skip(!hatLegacyPfade, 'keine Bestandsinstallation mit Legacy-Pfaden (Fremd-Setup)')
  const a = scanAll()
  const b = scanAll()
  const familien = Object.keys(a.data)
  const dump: Record<string, { kategorien: number; eintraege: number }> = {}
  for (const fam of familien) {
    const cats = a.data[fam]?.categories ?? []
    dump[fam] = {
      kategorien: cats.length,
      eintraege: cats.reduce((n: number, c: Category) => n + c.entries.length, 0)
    }
    // Determinismus im selben Lauf.
    const catsB = b.data[fam]?.categories ?? []
    expect(catsB.length).toBe(cats.length)
    expect(catsB.reduce((n: number, c: Category) => n + c.entries.length, 0))
      .toBe(dump[fam]!.eintraege)
  }
  // Kernfamilien bleiben real befuellt (Read-Regression-Fang des Gates).
  for (const fam of ['claude', 'codex', 'userglobal']) {
    expect(dump[fam]?.eintraege ?? 0, `Familie ${fam} leer`).toBeGreaterThan(0)
  }
  const dir = join(process.cwd(), 'tests', 'audit-runtime', 'wp7-scan-umfang')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'scan-nachher.json'),
    JSON.stringify({
      stand: '2026-07-27', gate: 'WP-7 Scan-Umfang unveraendert (WP-11+WP-12)',
      wurzeln: configWatchRootList(gateDeps), familien: dump
    }, null, 2),
    'utf8'
  )
})
