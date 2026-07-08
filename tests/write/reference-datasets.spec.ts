import { test, expect } from '@playwright/test'
import { datasetForModel, firstArtifactId } from '../../src/renderer/sections/referenz/reference-datasets'

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
