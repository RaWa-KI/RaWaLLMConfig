// root-resolution-portable.spec.ts — B13 Portabilitaet Wurzelmodell (WP-12).
// Belegt: (1) realRoots() enthaelt nur noch Tool-Homes (kein Rechner-Hardcode),
// (2) Fremd-Home ohne bisherige Ordnerstruktur -> source 'none', kein Crash,
// (3) Legacy-Migration (Seed + Marker) haelt Bestandsinstallationen unveraendert,
// (4) Prefs-UI zeigt ungesetzte optionale Wurzeln als "nicht konfiguriert".
// Env/Provider-Seams wie config-roots.spec.ts; nach jedem Test zuruecksetzen.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test, expect } from '@playwright/test'
import {
  configRoots, configRootList, discoverConfigRoots,
  setRootPrefsProvider, setRootExistsProvider
} from '../../src/main/services/config-roots'
import {
  realRoots, legacyRootDefaults, legacyRootPrefsSeed,
  ROOTS_LEGACY_MIGRATION_KEY
} from '../../src/main/services/config-root-resolution'
import { seedLegacyRootPrefs } from '../../src/main/ipc-write-prefs'

test.beforeEach(() => {
  delete process.env.RAWALLM_SANDBOX_ROOT
})

test.afterEach(() => {
  setRootPrefsProvider(() => ({}))
  setRootExistsProvider(existsSync)
  delete process.env.RAWALLM_SANDBOX_ROOT
})

test('realRoots liefert nur noch die Tool-Homes (kein Rechner-Pfad mehr)', () => {
  const roots = realRoots() as Record<string, string>
  expect(Object.keys(roots).sort()).toEqual(['claudeHome', 'codexHome'])
  const home = homedir()
  expect(roots.claudeHome).toBe(join(home, '.claude'))
  expect(roots.codexHome).toBe(join(home, '.codex'))
  for (const value of Object.values(roots)) {
    expect(value.includes('Desktop')).toBe(false)
  }
})

// Regression-Guard (war auch vor dem Fix gruen): ohne existierende Legacy-Pfade
// duerfen die optionalen Wurzeln nicht erfunden werden.
test('Fremd-Home ohne bisherige Ordner: optionale Wurzeln none, kein Crash', () => {
  setRootPrefsProvider(() => ({}))
  setRootExistsProvider(() => false)
  const discovered = discoverConfigRoots()
  expect(discovered.sharedClaude).toEqual({ value: null, source: 'none' })
  expect(discovered.workspaceParent).toEqual({ value: null, source: 'none' })
  expect(discovered.projectRoot).toEqual({ value: null, source: 'none' })
  const roots = configRoots()
  expect(roots.sharedClaude).toBeNull()
  expect(roots.projectRoot).toBeNull()
  expect(configRootList()).toEqual([roots.claudeHome, roots.codexHome])
})

test('Migration-Seed: Bestandsinstallation loest unveraendert auf', () => {
  const legacy = legacyRootDefaults()
  const hasLegacy = existsSync(legacy.sharedClaude)
    && existsSync(legacy.workspaceParent) && existsSync(legacy.projectRoot)
  test.skip(!hasLegacy, 'keine Bestandsinstallation mit Legacy-Pfaden')
  setRootExistsProvider(existsSync)
  // (1) Reiner Seed fuellt genau die existierenden, ungesetzten Wurzeln.
  const seed = legacyRootPrefsSeed({})
  expect(seed).toEqual({
    'roots.sharedClaude': legacy.sharedClaude,
    'roots.workspaceParent': legacy.workspaceParent,
    'roots.projectRoot': legacy.projectRoot
  })
  // (2) Migrierte Prefs (Seed + Marker) = bisherige Aufloesung (Werte identisch).
  setRootPrefsProvider(() => ({ ...seed, [ROOTS_LEGACY_MIGRATION_KEY]: 'done' }))
  const migrated = discoverConfigRoots()
  expect(migrated.sharedClaude).toEqual({ value: legacy.sharedClaude, source: 'prefs' })
  expect(migrated.workspaceParent).toEqual({ value: legacy.workspaceParent, source: 'prefs' })
  expect(migrated.projectRoot).toEqual({ value: legacy.projectRoot, source: 'prefs' })
  // (3) Lazy Migration ohne gesetzte Prefs (laeuft beim Start) = Vor-Fix-Aufloesung.
  setRootPrefsProvider(() => ({}))
  const lazy = discoverConfigRoots()
  expect(lazy.sharedClaude).toEqual({ value: legacy.sharedClaude, source: 'default' })
  expect(lazy.workspaceParent).toEqual({ value: legacy.workspaceParent, source: 'default' })
  expect(lazy.projectRoot).toEqual({ value: legacy.projectRoot, source: 'default' })
  expect(configRoots().sharedClaude).toBe(legacy.sharedClaude)
  expect(configRoots().projectRoot).toBe(legacy.projectRoot)
})

test('Seed ueberschreibt keine gesetzten Prefs und respektiert den Marker', () => {
  setRootExistsProvider(() => true)
  const seed = legacyRootPrefsSeed({ 'roots.projectRoot': 'D:\\Eigen' })
  expect(seed['roots.projectRoot']).toBeUndefined()
  expect(seed['roots.sharedClaude']).toBeDefined()
  expect(legacyRootPrefsSeed({ [ROOTS_LEGACY_MIGRATION_KEY]: 'done' })).toEqual({})
  setRootExistsProvider(() => false)
  expect(legacyRootPrefsSeed({})).toEqual({})
})

test('Marker ohne eigene Prefs: optionale Wurzeln bleiben none', () => {
  setRootPrefsProvider(() => ({ [ROOTS_LEGACY_MIGRATION_KEY]: 'done' }))
  setRootExistsProvider(() => true)
  const discovered = discoverConfigRoots()
  expect(discovered.sharedClaude).toEqual({ value: null, source: 'none' })
  expect(discovered.projectRoot).toEqual({ value: null, source: 'none' })
})

// Source-Pin: die bisherige Festverdrahtung darf nur noch als markierter
// Migrations-Code existieren (genau eine Stelle), sonst nirgends.
test('Source-Pin: Desktop/Projekte nur noch als markierter Migrations-Code', () => {
  const resolution = readFileSync(
    join(process.cwd(), 'src/main/services/config-root-resolution.ts'), 'utf8')
  expect(resolution).toContain('MIGRATIONS-CODE')
  expect(resolution.split("'Desktop'").length - 1).toBe(1)
  const rootsSource = readFileSync(
    join(process.cwd(), 'src/main/services/config-roots.ts'), 'utf8')
  expect(rootsSource).not.toContain('Desktop')
  expect(rootsSource).not.toContain('Projekte (Parent)')
})

test('Prefs-UI zeigt fehlende Wurzeln als nicht konfiguriert', () => {
  const prefsUi = readFileSync(
    join(process.cwd(), 'src/renderer/sections/prefs/PrefsSection.tsx'), 'utf8')
  expect(prefsUi).toContain('nicht konfiguriert')
  expect(prefsUi).not.toContain('Vorhandener Standardpfad')
})

// Integrations-Verdrahtung (Hauptsession): initPrefsStore persistiert den
// Legacy-Seed ueber seedLegacyRootPrefs — einmalig (Marker), ohne Ueberschreiben.
// exists wird explizit injiziert (nicht ueber das Modul-Global): auf Windows-CI
// divergierte das Global zwischen Spec- und src-Instanz (.claude/debugging.md
// 2026-07-28) — der Test waere sonst vom echten fs-Check abhaengig.
test('Persistente Migration: seedLegacyRootPrefs schreibt Wurzeln + Marker einmalig', async () => {
  const alwaysExists = () => true
  const writes: Array<[string, unknown]> = []
  const fakeStore = {
    getAll: async () => ({}),
    set: async (key: string, value: unknown) => { writes.push([key, value]); return { ok: true } }
  }
  const merged = await seedLegacyRootPrefs(fakeStore as never, {}, alwaysExists)
  expect(writes.map(([key]) => key)).toEqual([
    'roots.sharedClaude', 'roots.workspaceParent', 'roots.projectRoot',
    ROOTS_LEGACY_MIGRATION_KEY
  ])
  expect(merged[ROOTS_LEGACY_MIGRATION_KEY]).toBe('done')
  // Zweiter Lauf (Marker gesetzt) schreibt nichts mehr — idempotent.
  writes.length = 0
  const again = await seedLegacyRootPrefs(fakeStore as never, merged, alwaysExists)
  expect(writes).toEqual([])
  expect(again).toBe(merged)
})
