import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppData, System, Watcher } from '../../shared/contract'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'

test('one cause produces one Ollama diagnosis and retains expert evidence', () => {
  const cards = buildDiagnosisCards({ config: configuredModels(), system: ollamaHints(), watcher: readyWatcher(), errors: [] })
  const ollamaCards = cards.filter((card) => card.causeKey === 'local-models:ollama-hints')

  expect(ollamaCards).toHaveLength(1)
  expect(ollamaCards[0]).toMatchObject({
    title: 'Lokale Modelle prüfen',
    where: 'Einstellungen > Lokale Quellen',
    diagnosisAction: { route: 'settings', focusId: 'settings-tab-sources' }
  })
  expect(ollamaCards[0].changeHint).toContain('C:\\fixtures\\ollama-models')
  expect(ollamaCards[0].details).toEqual(expect.arrayContaining([
    expect.stringContaining('OLLAMA_*'),
    expect.stringContaining('C:\\fixtures\\ollama-models')
  ]))
})

test('different causes remain separate cards', () => {
  const cards = buildDiagnosisCards({ config: null, system: ollamaHints(), watcher: pausedWatcher(), errors: [] })
  expect(cards.filter((card) => card.causeKey === 'local-models:ollama-hints')).toHaveLength(1)
  expect(cards.find((card) => card.id === 'watcher-paused')).toBeTruthy()
})

test('simple diagnosis cards keep internal targets and evidence in expert mode', () => {
  const cards = readFileSync(resolve(process.cwd(), 'src/renderer/sections/overview/DiagnosisCards.tsx'), 'utf8')
  expect(cards).toContain("props.displayMode === 'expert' && <DiagnosisNextSteps")
  expect(cards).toContain("props.displayMode === 'simple' ? props.card.action : props.card.diagnosisAction.label")
})

function configuredModels(): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' }, machines: [], llms: [],
    data: { local: { duplicates: [], categories: [{ id: 'gguf-models', label: 'Modelle', icon: '', path: 'C:\\fixtures\\ollama-models', blurb: '', entries: [] }] } }
  }
}

function ollamaHints(): System {
  return {
    updated: 'today', areas: [{ id: 'env', label: '', icon: '', blurb: '', entries: [
      { id: 'env', name: 'OLLAMA_*', status: 'stale', desc: 'OLLAMA_MODELS zeigt auf C:\\fixtures\\ollama-models.' },
      { id: 'folder', name: 'Ollama-Ordner', status: 'stale', desc: 'Lokaler Hinweis gefunden.' }
    ] }]
  }
}

function readyWatcher(): Watcher {
  return { daemon: { status: 'ready', lastResult: '', schedule: '', tokens: '', sources: 1, updated: '', note: '' }, tiers: [], sources: [], changelogs: [] }
}

function pausedWatcher(): Watcher {
  return { ...readyWatcher(), daemon: { ...readyWatcher().daemon, status: 'paused' } }
}
