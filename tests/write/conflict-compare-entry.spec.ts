import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Category, ConfigEntry } from '../../shared/contract'

// WP-2 (P0 „Unterschiede ansehen" wirkungslos): Der Konflikt-Kasten im Detail-
// Drawer muss in BEIDEN Anzeige-Modi zu einem echten Diff des Konfliktpaars
// fuehren. Vorher brach die Kette an drei Stellen:
//   1. ConfigSection liess den Modus 'compare' im Einfach-Modus nicht durch,
//   2. der Drawer setzte gar kein Preset (Vergleichsansicht blieb leer),
//   3. CompareView verwarf jedes Preset, dessen Herkunft nicht 'coverage' war.
// Verhaltenstests laufen gegen die reinen Preset-Funktionen aus Drawer.tsx; die
// Conditional-Renderings/Verdrahtungen werden per Source-Pin gesichert
// (tests/write hat bewusst kein Browser-Setup — Muster: config-mode-teil-e.spec.ts).

// CSS-Importe der Renderer-Module sind fuer den Node-Runner unlesbar -> Stub.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(require as any).extensions['.css'] = () => undefined
// eslint-disable-next-line @typescript-eslint/no-var-requires
const drawer = require('../../src/renderer/components/Drawer') as typeof import('../../src/renderer/components/Drawer')

const drawerSrc = read('src/renderer/components/Drawer.tsx')
const configSection = read('src/renderer/sections/config/ConfigSection.tsx')
const compareView = read('src/renderer/sections/compare/CompareView.tsx')
const modeTabs = read('src/renderer/sections/config/CategoryModeTabs.tsx')
const types = read('src/renderer/state/types.ts')

function entry(p: Partial<ConfigEntry> & { id: string; name: string }): ConfigEntry {
  return {
    scope: 'global',
    status: 'active',
    desc: '',
    updated: '2026-07-26',
    ...p,
  } as ConfigEntry
}

function category(entries: ConfigEntry[]): Category {
  return { id: 'rules', label: 'Rules', icon: 'list', path: '~/.claude/rules', blurb: '', entries }
}

test('conflictPartners liefert das Gegenstueck, nicht die ganze Kategorie', () => {
  const conflicted = entry({
    id: 'a',
    name: 'settings.json',
    status: 'conflict',
    conflictReason: 'Nur im Plugin-Ordner — fehlt im MCP-Register',
    path: 'C:/a/settings.json',
  })
  const twin = entry({ id: 'b', name: 'settings', path: 'C:/b/settings' })
  const unrelated = entry({ id: 'c', name: 'hooks.json', path: 'C:/c/hooks.json' })
  const cat = category([conflicted, twin, unrelated])

  const partners = drawer.conflictPartners(cat, conflicted)
  expect(partners.map((e) => e.id)).toEqual(['b'])
})

test('conflictPartners bevorzugt die explizite Kopie-Beziehung (dupOf)', () => {
  const conflicted = entry({ id: 'a', name: 'agents.md', status: 'conflict', path: 'C:/a/agents.md', dupOf: 'b' })
  const copy = entry({ id: 'b', name: 'irgendwas-anderes.md', path: 'C:/b/agents.md' })
  const sameName = entry({ id: 'c', name: 'agents.md', path: 'C:/c/agents.md' })
  const partners = drawer.conflictPartners(category([conflicted, copy, sameName]), conflicted)
  expect(partners.map((e) => e.id)).toEqual(['b'])
})

test('conflictComparePreset erzeugt ein startfaehiges Konflikt-Preset', () => {
  const conflicted = entry({
    id: 'a',
    name: 'settings.json',
    status: 'conflict',
    conflictReason: 'Nur im MCP-Register — fehlt im Plugin-Ordner',
    path: 'C:/a/settings.json',
  })
  const twin = entry({ id: 'b', name: 'settings.json', path: 'C:/b/settings.json' })
  const noise = entry({ id: 'c', name: 'hooks.json', path: 'C:/c/hooks.json' })
  const cat = category([conflicted, twin, noise])

  const preset = drawer.conflictComparePreset(cat, conflicted, { section: 'config', llm: 'claude' })
  // Herkunft 'conflict' — CompareView nimmt beide Herkuenfte an (siehe Pin unten).
  expect(preset.source).toBe('conflict')
  // Genau das Konfliktpaar, kein Kategorie-Rundumschlag.
  expect(preset.candidates.map((c) => c.id)).toEqual(['a', 'b'])
  expect(preset.candidates.map((c) => c.path)).toEqual(['C:/a/settings.json', 'C:/b/settings.json'])
  // >=2 Kandidaten = Autostart-faehig (echter Diff statt „Waehle >=2 Dateien").
  expect(preset.candidates.length).toBeGreaterThanOrEqual(2)
  expect(preset.row.name).toBe('settings.json')
  expect(preset.row.notes).toEqual(['Nur im MCP-Register — fehlt im Plugin-Ordner'])
  expect(preset.createdFrom.rowId).toBe('conflict:rules:a')
  expect(preset.createdFrom.catId).toBe('rules')
})

test('Einzeldatei-Konflikt bleibt ehrlich: ein Kandidat, kein erfundener Partner', () => {
  const lonely = entry({
    id: 'a',
    name: 'installed_plugins.json',
    status: 'conflict',
    conflictReason: 'JSON-Parse-Fehler in installed_plugins.json',
    path: 'C:/a/installed_plugins.json',
  })
  const preset = drawer.conflictComparePreset(category([lonely]), lonely, { section: 'config', llm: 'claude' })
  expect(preset.candidates).toHaveLength(1)
  // Die Vergleichsansicht sagt das im Klartext statt still nichts zu tun.
  expect(compareView).toContain('Zu diesem Konflikt gibt es nur eine Datei')
})

test('Drawer verdrahtet den Konflikt-Knopf auf Preset + Vergleichsmodus', () => {
  expect(drawerSrc).toContain('conflictComparePreset(found.cat, found.entry, { section: ui.section, llm: ui.llm })')
  expect(drawerSrc).toContain('actions.setComparePreset(preset)')
  expect(drawerSrc).toContain("actions.setMode('compare')")
  expect(drawerSrc).toContain('actions.setCompareSelection(preset.candidates.map((candidate) => candidate.id))')
  // Der Knopf im Konflikt-Kasten haengt an genau diesem Handler.
  expect(drawerSrc).toContain('className="drawer-conflict-action" onClick={openCompare}')
})

test('Preset-Vergleich laeuft auch im Einfach-Modus, ohne neuen Dauer-Tab', () => {
  expect(configSection).toContain("const presetCompare = ui.mode === 'compare' && !!ui.comparePreset")
  expect(configSection).toContain(
    "const mode: Mode = expert || presetCompare || ui.mode === 'overview' || (ui.mode === 'diff' && !isShared) ? ui.mode : 'overview'"
  )
  // Der Vergleich-Tab bleibt expert-only: kein neuer Dauer-Reiter im Einfach-Modus.
  expect(modeTabs).toContain('{expert && (')
  expect(modeTabs).toContain("onClick={() => onMode('compare')}")
})

test('CompareView nimmt Presets beider Herkuenfte an und startet selbst', () => {
  // Kein Herkunfts-Filter mehr — der frueher stumme Verwurf ist weg.
  expect(compareView).not.toContain("source === 'coverage'")
  expect(compareView).toContain('const preset = comparePreset')
  expect(compareView).toContain('usePresetAutostart(preset, setSt, handleCompare)')
  expect(compareView).toContain('void handleCompare(preset.candidates)')
  expect(compareView).toContain('const text = PRESET_TEXT[preset.source]')
  // Herkunftstyp im Store-Vertrag erweitert.
  expect(types).toContain("export type ComparePresetOrigin = 'coverage' | 'conflict'")
  expect(types).toContain('source: ComparePresetOrigin')
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
