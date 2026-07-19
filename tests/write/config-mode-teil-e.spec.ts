import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deMessages, enMessages, isMessageKey, MESSAGE_KEYS, msgMode } from '../../shared/messages'
import { msgMode as msgModeRenderer } from '../../src/renderer/lib/messages'
import { categoryLabel } from '../../src/renderer/sections/config/category-label'

// Teil E, WP2 (Owner-Entscheid D1–D3, 2026-07-18): Config-Form-Weiche je DisplayMode.
// Verhaltenstests laufen gegen die Message-Projektion (shared/messages, Renderer-
// Fassade lib/messages) und die Kategorie-Projektion (category-label.ts); die
// Conditional-Renderings in den Flaechen werden per Source-Pin gesichert
// (tests/write hat bewusst kein Browser-Setup — Muster: nav-visibility-teil-e.spec.ts).

const configSection = read('src/renderer/sections/config/ConfigSection.tsx')
const modeTabs = read('src/renderer/sections/config/CategoryModeTabs.tsx')
const diffView = read('src/renderer/sections/config/DiffView.tsx')
const dirDiffView = read('src/renderer/sections/config/DirDiffView.tsx')
const configParts = read('src/renderer/sections/config/config-parts.tsx')
const duplicatePanel = read('src/renderer/sections/config/DuplicatePanel.tsx')
const libMessages = read('src/renderer/lib/messages.ts')

test('msgMode resolves .simple/.expert variants and falls back to the base key', () => {
  // .simple-Variante vorhanden -> wird aufgeloest.
  expect(msgModeRenderer('simple', 'config.mode.duplicates')).toBe('Doppelte Einträge')
  // .expert-Variante registriert -> eigene Projektion.
  expect(msgModeRenderer('expert', 'config.mode.duplicates')).toBe('Duplikate')
  // Kategorie-Keys: .simple registriert, .expert faellt auf den Basis-Key zurueck.
  expect(msgModeRenderer('simple', 'config.category.skills')).toBe('Fähigkeiten')
  expect(msgModeRenderer('expert', 'config.category.skills')).toBe('Skills')
  // Key ganz ohne Mode-Variante -> Basis-Key in beiden Modi.
  expect(msgModeRenderer('simple', 'settings.tab.tweaks')).toBe('Darstellung')
  expect(msgModeRenderer('expert', 'settings.tab.tweaks')).toBe('Darstellung')
  // Gleiche Aufloesung im shared-Kern (dort liegen Kataloge + Locale).
  expect(msgMode('simple', 'config.mode.duplicates')).toBe('Doppelte Einträge')
  expect(isMessageKey('config.mode.duplicates.simple')).toBe(true)
  expect(isMessageKey('config.category.skills.expert')).toBe(false)
})

test('msgMode honors the locale parameter for projected variants', () => {
  expect(msgMode('simple', 'config.mode.duplicates', undefined, 'en')).toBe('Duplicate entries')
  expect(msgMode('expert', 'config.category.agents', undefined, 'en')).toBe('Agents')
  expect(msgMode('simple', 'config.category.mcp', undefined, 'en')).toBe('Connections')
})

test('config projection keys are mirrored in both locales', () => {
  const configKeys = MESSAGE_KEYS.filter((key) => key.startsWith('config.'))
  expect(configKeys.length).toBeGreaterThan(0)
  for (const key of configKeys) {
    expect(deMessages[key]).toBeTruthy()
    expect(enMessages[key]).toBeTruthy()
  }
})

test('simple mode hides Spiegelung/Vergleich tabs, expert keeps all category modes', () => {
  expect(modeTabs).toContain("const expert = displayMode === 'expert'")
  // Diff-Tab der Shared-Familie („Spiegelung") nur fuer Experten gerendert.
  expect(modeTabs).toContain('{(expert || !isShared) && (')
  expect(modeTabs).toContain('{isShared ? mirrorLabel : msgMode(displayMode,')
  // Vergleich-Tab expert-only; Uebersicht bleibt in beiden Modi ungegate't.
  expect(modeTabs).toContain('{expert && (')
  expect(modeTabs).toContain("onClick={() => onMode('compare')}")
  // Gespeicherter Experten-Modus faellt im simple-Body auf Uebersicht zurueck
  // (kein State-Eingriff, kein toter View).
  expect(configSection).toContain(
    "const mode: Mode = expert || (ui.mode === 'overview' || (ui.mode === 'diff' && !isShared)) ? ui.mode : 'overview'"
  )
  expect(configSection).toContain('<CategoryBody ad={ad} cat={cat} mode={mode}')
})

test('path, diff-line and register surfaces are expert-only', () => {
  // Roh-Pfad im Kategorie-Kopf nur im Experten-Modus.
  expect(configSection).toContain('{expert && <> · <span className="mono">{cat.path}</span></>}')
  // Read-only-Diff-Zeilen (DiffReadOnly) nur expert; MergeEditor bleibt beiden Modi.
  expect(diffView).toContain("const expert = ui.displayMode === 'expert'")
  expect(diffView).toContain('expert && <DiffReadOnly')
  expect(diffView).toContain('<MergeEditor')
  // Ordner-Diff-Tabelle (rel-Pfade + Drills) nur expert; Summary + Aktionen bleiben.
  expect(dirDiffView).toContain("const expert = ui.displayMode === 'expert'")
  expect(dirDiffView).toContain('{expert && (')
  expect(dirDiffView).toContain('<DirSummary dir={dir} labels={labels} />')
  expect(dirDiffView).toContain('<DirReconcileActions d={d} dir={dir} knownPaths={knownPaths} />')
})

test('categoryLabel projects simple everyday names and expert technical labels', () => {
  expect(categoryLabel('simple', { id: 'skills', label: 'Skills' })).toBe('Fähigkeiten')
  expect(categoryLabel('expert', { id: 'skills', label: 'Skills' })).toBe('Skills')
  // Familien-Praefixe laufen ueber dieselbe Achse (shared/cat-key.ts).
  expect(categoryLabel('simple', { id: 'shared-skills', label: 'Skills' })).toBe('Fähigkeiten')
  expect(categoryLabel('simple', { id: 'codex-agents', label: 'Agents' })).toBe('Assistenten')
  expect(categoryLabel('simple', { id: 'userglobal-claude-rules', label: 'Rules' })).toBe('Regeln')
  expect(categoryLabel('simple', { id: 'codex-instructions', label: 'Instructions' })).toBe('Anweisungen')
  expect(categoryLabel('simple', { id: 'mcp', label: 'MCP-Integrationen' })).toBe('Verbindungen')
  expect(categoryLabel('expert', { id: 'codex-hooks', label: 'Hooks' })).toBe('Hooks')
  // Fallback: unbekannte/datengetriebene Ids behalten das Scanner-Label.
  expect(categoryLabel('simple', { id: 'cloud-custom-0', label: 'OpenAI' })).toBe('OpenAI')
})

test('category name projection is wired into sidebar, head, search rows and dup rows', () => {
  expect(configSection).toContain('categoryLabel(ui.displayMode, c)')
  expect(configSection).toContain('categoryLabel(ui.displayMode, cat)')
  expect(configParts).toContain('categoryLabel(ui.displayMode, cat)')
  expect(duplicatePanel).toContain('categoryLabel(ui.displayMode, cat)')
})

test('duplicates tab label comes from the mode projection', () => {
  expect(msgModeRenderer('simple', 'config.mode.duplicates')).toBe('Doppelte Einträge')
  expect(msgModeRenderer('expert', 'config.mode.duplicates')).toBe('Duplikate')
  expect(modeTabs).toContain("msgMode(displayMode, 'config.mode.duplicates')")
  // Renderer-Fassade re-exportiert die Projektion direkt neben msg/msgText.
  expect(libMessages).toContain("export { msg, msgText, msgMode, isMessageKey } from '@shared/messages'")
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
