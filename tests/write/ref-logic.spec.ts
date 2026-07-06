// ref-logic.spec.ts — Drift-Semantik des „Betrifft dich"-Banners (WP10, QUAL-HOCH-03).
// Sichert: (1) Gap-Filter — nur Deltas in der echten Versionsluecke
// (installiert < seit <= neueste) erscheinen; das statische outOfGap-Flag zaehlt NICHT.
// (2) Tri-State affects — 'yes' nur bei genutztem Artefakt + aktueller Quelle,
// 'uncertain' bei staler Quelle (NIE pauschal alle Deltas als betroffen),
// 'no' bei ungenutztem Artefakt. (3) art→Scan-Kategorie-Mapping — 'agent' matcht
// Kategorie 'agents'; 'slash' ist nie „nutzt du". Reine Fixtures, kein FS/Store.
// (4) occurrencesFor key-genau (WP25, QUAL-MITTEL-02) — exakt oder
// Punkt-Grenzen-Suffix, KEIN flacher Tail-Match mehr; Match-Key-Ausweis je
// Fundstelle; art-Scoping ueber cats (leer -> [], undefined -> alle).
import { test, expect } from '@playwright/test'
import {
  artUsed,
  driftItems,
  occurrencesFor,
  sourceIsStale,
} from '../../src/renderer/sections/referenz/ref-logic'
import type { RefDataset } from '../../shared/contract-referenz'
import type { ConfigEntry, LlmConfig, WatcherSource } from '../../shared/contract'

// Minimaler Datensatz: 3 Deltas mit unterschiedlichen since-Versionen/arts.
function mkDataset(): RefDataset {
  return {
    label: 'Claude Code',
    artifacts: [],
    changelog: {
      source: 'fixture',
      installed: '2.1.120',
      latest: '2.1.157',
      deltas: [
        { id: 'd1', kind: 'added', art: 'agent', field: null, key: 'skills', since: '2.1.130' },
        { id: 'd2', kind: 'renamed', art: 'slash', field: null, key: '/fork', to: '/branch', since: '2.1.77' },
        { id: 'd3', kind: 'added', art: 'settings', field: null, key: 'skillOverrides', since: '2.1.140' },
      ],
    },
  }
}

// Watcher-Quelle fuer llm 'claude' (sourceFor matcht /claude code/i auf name).
function mkSource(state: WatcherSource['state']): WatcherSource[] {
  return [
    { name: 'Claude Code Changelog', kind: 'changelog', current: '2.1.120', latest: '2.1.157', tier: 1, state },
  ]
}

const VER = { installed: '2.1.120', latest: '2.1.157' }

test('Gap-Filter: nur Deltas in der Versionsluecke erscheinen', () => {
  const items = driftItems(mkDataset(), VER, mkSource('current'), 'claude', new Set())
  const fields = items.map((i) => i.field)
  // since 2.1.130 + 2.1.140 liegen in (2.1.120, 2.1.157] -> drin.
  expect(fields).toContain('skills')
  expect(fields).toContain('skillOverrides')
  // since 2.1.77 <= installiert 2.1.120 -> raus, trotz statischem outOfGap-Verzicht.
  expect(fields).not.toContain('/fork → /branch')
  expect(items.length).toBe(2)
})

test('A17-Kern: installiert > neueste -> leeres Banner, kein yes', () => {
  const items = driftItems(
    mkDataset(),
    { installed: '2.1.170', latest: '2.1.165' },
    mkSource('current'),
    'claude',
    new Set(['agents', 'settings']),
  )
  expect(items).toEqual([])
  expect(items.filter((i) => i.affects === 'yes').length).toBe(0)
})

test('ohne Watcher-Versionen (ver null) bleibt das Banner leer', () => {
  const items = driftItems(mkDataset(), null, mkSource('current'), 'claude', new Set(['agents']))
  expect(items).toEqual([])
})

test('artUsed: agent matcht Scan-Kategorie agents; slash nie', () => {
  const used = new Set(['agents'])
  expect(artUsed('agent', used)).toBe(true)
  expect(artUsed('slash', used)).toBe(false)
  // slash auch bei wortgleicher Kategorie nicht (leeres Mapping, kein Fallback).
  expect(artUsed('slash', new Set(['slash']))).toBe(false)
  // Codex-Seite: config/approvals -> codex-settings, hook -> codex-hooks.
  expect(artUsed('config', new Set(['codex-settings']))).toBe(true)
  expect(artUsed('approvals', new Set(['codex-settings']))).toBe(true)
  expect(artUsed('hook', new Set(['codex-hooks']))).toBe(true)
  // Unbekanntes art faellt auf gleichnamige Kategorie zurueck.
  expect(artUsed('mystery', new Set(['mystery']))).toBe(true)
  expect(artUsed('mystery', new Set(['agents']))).toBe(false)
})

test('Tri-State: aktuelle Quelle + genutzt -> yes; ungenutzt -> no', () => {
  const items = driftItems(mkDataset(), VER, mkSource('current'), 'claude', new Set(['agents']))
  const byField = Object.fromEntries(items.map((i) => [i.field, i.affects]))
  expect(byField['skills']).toBe('yes') // art 'agent' + Kategorie 'agents'
  expect(byField['skillOverrides']).toBe('no') // 'settings' nicht in used
})

test('Tri-State: stale Quelle -> uncertain statt yes, ungenutzt bleibt no', () => {
  const items = driftItems(mkDataset(), VER, mkSource('update'), 'claude', new Set(['agents']))
  const byField = Object.fromEntries(items.map((i) => [i.field, i.affects]))
  expect(byField['skills']).toBe('uncertain')
  expect(byField['skillOverrides']).toBe('no')
  // NIE pauschal alles als betroffen markieren (alter Bug QUAL-HOCH-03).
  expect(items.some((i) => i.affects === 'yes')).toBe(false)
})

// ── occurrencesFor (WP25) ────────────────────────────────────────────────

// Minimaler Config-Eintrag mit searchKeys (nur Keys/Struktur, NIE Werte).
function mkEntry(path: string, searchKeys: string[]): ConfigEntry {
  return {
    id: path,
    name: path,
    status: 'active',
    scope: 'global',
    path,
    desc: '',
    updated: '',
    searchKeys,
  }
}

// Config mit 2 Kategorien: settings + agents (fuer cats-Scoping-Tests).
function mkCfg(settingsEntries: ConfigEntry[], agentEntries: ConfigEntry[] = []): LlmConfig {
  return {
    categories: [
      { id: 'settings', label: 'Settings', icon: '', path: '', blurb: '', entries: settingsEntries },
      { id: 'agents', label: 'Agents', icon: '', path: '', blurb: '', entries: agentEntries },
    ],
    duplicates: [],
  }
}

test('occurrencesFor: flacher Tail-Match ist gestrichen (deny matcht permissions.deny NICHT)', () => {
  // Regression der belegten False-Positive-Quelle (ignorePatterns -> settings.json):
  // Delta-Key 'permissions.deny' darf einen flachen 'deny'-searchKey NICHT treffen.
  const cfg = mkCfg([mkEntry('settings.json', ['deny'])])
  expect(occurrencesFor('permissions.deny', cfg)).toEqual([])
})

test('occurrencesFor: exakter Match weist den gematchten searchKey aus', () => {
  const cfg = mkCfg([mkEntry('settings.json', ['permissions.deny'])])
  expect(occurrencesFor('permissions.deny', cfg)).toEqual([
    { path: 'settings.json', matchedKey: 'permissions.deny' },
  ])
})

test('occurrencesFor: Punkt-Grenzen-Suffix trifft (web_search via tools.web_search)', () => {
  const cfg = mkCfg([mkEntry('config.toml', ['tools.web_search'])])
  expect(occurrencesFor('web_search', cfg)).toEqual([
    { path: 'config.toml', matchedKey: 'tools.web_search' },
  ])
  // Kein Punkt-Grenzen-Treffer ohne Punkt davor ('toolsweb_search' bleibt raus).
  const cfg2 = mkCfg([mkEntry('x.json', ['toolsweb_search'])])
  expect(occurrencesFor('web_search', cfg2)).toEqual([])
})

test('occurrencesFor: cats-Scoping — agents-Entry bei cats [settings] nicht gefunden, [] -> immer []', () => {
  const cfg = mkCfg([], [mkEntry('agents/foo.md', ['skills'])])
  // Entry liegt in 'agents', gesucht wird nur in 'settings' -> leer.
  expect(occurrencesFor('skills', cfg, ['settings'])).toEqual([])
  // cats [] (z.B. art 'slash' aus ART_CATS) -> sofort [].
  expect(occurrencesFor('skills', cfg, [])).toEqual([])
  // undefined -> alle Kategorien (Rueckwaertskompatibilitaet).
  expect(occurrencesFor('skills', cfg)).toEqual([{ path: 'agents/foo.md', matchedKey: 'skills' }])
  // passendes Scoping findet den Treffer.
  expect(occurrencesFor('skills', cfg, ['agents'])).toEqual([
    { path: 'agents/foo.md', matchedKey: 'skills' },
  ])
})

test('driftItems: d.to-Fundstellen dedupliziert ueber path|matchedKey', () => {
  // renamed-Delta in der Luecke; der searchKey 'permissions.deny' trifft
  // SOWOHL d.key 'deny' (Punkt-Grenzen-Suffix) ALS AUCH d.to 'permissions.deny'
  // (exakt) — gleiche Fundstelle path|matchedKey -> nur EINMAL gelistet.
  // Ziel-Key-eigener Treffer in zweiter Datei kommt dazu.
  const ds: RefDataset = {
    label: 'Claude Code',
    artifacts: [],
    changelog: {
      source: 'fixture',
      installed: '2.1.120',
      latest: '2.1.157',
      deltas: [
        { id: 'r1', kind: 'renamed', art: 'settings', field: null, key: 'deny', to: 'permissions.deny', since: '2.1.130' },
      ],
    },
  }
  const cfg = mkCfg([
    mkEntry('settings.json', ['permissions.deny']),
    mkEntry('managed.json', ['x.permissions.deny']),
  ])
  const items = driftItems(ds, VER, mkSource('current'), 'claude', new Set(['settings']), cfg)
  expect(items.length).toBe(1)
  expect(items[0].occurrences).toEqual([
    { path: 'settings.json', matchedKey: 'permissions.deny' },
    { path: 'managed.json', matchedKey: 'x.permissions.deny' },
  ])
})

test('driftItems: art-Scoping — slash erzeugt keine Fundstellen, settings sucht nur in settings', () => {
  const ds = mkDataset()
  const cfg = mkCfg(
    [mkEntry('settings.json', ['skillOverrides'])],
    // 'skills' liegt NUR in agents -> Delta d1 (art 'agent', cats ['agents']) findet es;
    // ein gleichnamiger Key in settings wuerde fuer d1 NICHT zaehlen.
    [mkEntry('agents/foo.md', ['skills'])],
  )
  const items = driftItems(ds, VER, mkSource('current'), 'claude', new Set(['agents']), cfg)
  const byField = Object.fromEntries(items.map((i) => [i.field, i.occurrences]))
  expect(byField['skills']).toEqual([{ path: 'agents/foo.md', matchedKey: 'skills' }])
  expect(byField['skillOverrides']).toEqual([
    { path: 'settings.json', matchedKey: 'skillOverrides' },
  ])
})

test('driftItems: art slash (ART_CATS leer) liefert keine Fundstellen', () => {
  // /fork liegt ausserhalb der Luecke in mkDataset — eigener Datensatz mit slash in der Luecke.
  const ds: RefDataset = {
    label: 'Claude Code',
    artifacts: [],
    changelog: {
      source: 'fixture',
      installed: '2.1.120',
      latest: '2.1.157',
      deltas: [
        { id: 's1', kind: 'renamed', art: 'slash', field: null, key: '/fork', to: '/branch', since: '2.1.130' },
      ],
    },
  }
  // searchKey wuerde ohne Scoping treffen — art 'slash' (cats []) blockt.
  const cfg = mkCfg([mkEntry('settings.json', ['/fork'])])
  const items = driftItems(ds, VER, mkSource('current'), 'claude', new Set(), cfg)
  expect(items.length).toBe(1)
  expect(items[0].occurrences).toEqual([])
})

test('sourceIsStale: nur nicht-current zaehlt; ohne Quelle false', () => {
  expect(sourceIsStale(mkSource('current'), 'claude')).toBe(false)
  expect(sourceIsStale(mkSource('update'), 'claude')).toBe(true)
  expect(sourceIsStale(mkSource('recent'), 'claude')).toBe(true)
  expect(sourceIsStale(undefined, 'claude')).toBe(false)
  // Quelle eines anderen Tools matcht nicht.
  expect(sourceIsStale(mkSource('update'), 'codex')).toBe(false)
})
