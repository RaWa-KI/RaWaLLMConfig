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
  expect(drawer).toContain('actions.setCompareSelection(ids)')
  expect(drawer).toContain("actions.setMode('compare')")
  expect(drawer).toContain("found.cat.entries.filter((candidate) => candidate.path)")
  expect(drawer).toContain("displayMode === 'expert' && <span className=\"drawer-conflict-reason\">")
})

test('duplicate layer chips use everyday German labels', () => {
  expect(duplicatePanel).toContain('Gemeinsame Version')
  expect(duplicatePanel).toContain('Deine Workspace-Kopie')
  expect(duplicatePanel).toContain("'Claude' : 'Codex'")
})

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}
