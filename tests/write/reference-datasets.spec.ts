import { test, expect } from '@playwright/test'
import type { AppData } from '../../shared/contract'
import { commandModelId, datasetForModel, firstArtifactId } from '../../src/renderer/sections/referenz/reference-datasets'

test('help mode opens the slash-command catalog first', () => {
  const dataset = datasetForModel(null, 'claude', 'commands')
  expect(firstArtifactId(dataset, 'commands')).toBe('slash')
  expect(dataset.artifacts).toHaveLength(1)
  expect(dataset.artifacts[0].label).toBe('/-Befehle (Katalog)')
  expect(dataset.artifacts[0].fields.some((field) => field.key === '/help')).toBeTruthy()
  expect(dataset.artifacts[0].fields.some((field) => field.key === '/clear')).toBeTruthy()
  expect(dataset.artifacts[0].fields.some((field) => field.key === '/compact')).toBeTruthy()
})

test('work environment mode keeps the full reference map', () => {
  const dataset = datasetForModel(null, 'claude', 'environment')
  expect(dataset.artifacts.length).toBeGreaterThan(1)
  expect(dataset.artifacts.some((artifact) => artifact.id === 'slash')).toBeTruthy()
})

test('help mode selects the first command catalog with entries', () => {
  const data = appDataWithSharedFirst()
  expect(commandModelId(data, 'shared')).toBe('claude')
  expect(datasetForModel(data, commandModelId(data, 'shared'), 'commands').artifacts[0].fields.length)
    .toBeGreaterThan(0)
})

function appDataWithSharedFirst(): AppData {
  return {
    snapshot: { frozen: false, date: '2026-07-08', label: 'test' },
    machines: [],
    llms: [
      { id: 'shared', glyph: 'S', name: 'Shared', sub: 'Cross-Workspace', color: '', path: '' },
      { id: 'claude', glyph: 'C', name: 'Claude', sub: 'Anthropic', color: '', path: '' }
    ],
    data: {
      shared: { categories: [], duplicates: [] },
      claude: { categories: [], duplicates: [] }
    }
  }
}
