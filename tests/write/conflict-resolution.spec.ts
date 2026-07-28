import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const conflictResolution = read('src/renderer/components/ConflictResolution.tsx')
const drawer = read('src/renderer/components/Drawer.tsx')
const duplicatePanel = read('src/renderer/sections/config/DuplicatePanel.tsx')

test('conflict copy keeps technical detail for experts and routes comparison read-only', () => {
  expect(conflictResolution).toContain("ui.displayMode === 'expert' &&")
  expect(conflictResolution).toContain('<b>Technischer Grund:</b> {entry.conflictReason}')
  expect(conflictResolution).toContain('<span>Unterschiede ansehen</span>')
  expect(conflictResolution).toContain('onClick={onCompare}')
  expect(drawer).toContain("actions.setMode('compare')")
  // Nachzug: statt pauschaler Kategorie-Auswahl setzt der Drawer jetzt ein
  // Konflikt-Preset (nur das Konfliktpaar) — das war die Fehlerbehebung, weil
  // "Unterschiede ansehen" mit der alten Pauschalauswahl wirkungslos war.
  expect(drawer).toContain('const preset = conflictComparePreset(found.cat, found.entry, { section: ui.section, llm: ui.llm })')
  expect(drawer).toContain('actions.setCompareSelection(preset.candidates.map((candidate) => candidate.id))')
  expect(drawer).toContain('actions.setComparePreset(preset)')
  expect(drawer).toContain("displayMode === 'expert' && <span className=\"drawer-conflict-reason\">")
})

// P0-Nachzug: Der Text zur Richtung "nur im MCP-Register" darf nicht mehr
// vorschlagen, vorhandene Plugin-Dateien zu "ergaenzen" — der echte Fall ist ein
// Namens-/Pfad-Versatz zwischen Registereintrag und Ordner.
test('conflict copy for register-only entries points to the name mismatch', () => {
  expect(conflictResolution).not.toContain('die fehlenden Plugin-Dateien ergänzen')
  expect(conflictResolution).toContain('Ein eingetragener MCP-Server hat keinen gleichnamigen Plugin-Ordner.')
  expect(conflictResolution).toContain('wie der Ordner wirklich heißt')
})

test('duplicate layer chips use everyday German labels', () => {
  expect(duplicatePanel).toContain('Gemeinsame Version')
  expect(duplicatePanel).toContain('Deine Workspace-Kopie')
  expect(duplicatePanel).toContain("'Claude' : 'Codex'")
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
