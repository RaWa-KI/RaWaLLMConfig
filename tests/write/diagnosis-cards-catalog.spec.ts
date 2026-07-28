// diagnosis-cards-catalog.spec.ts — WP-3 (B3): Diagnose-Karten ohne
// Katalog-Falschpositive. Endpoint-/Modell-Katalog-Eintraege tragen per Design
// status 'stale' („Katalog/nicht geprueft", llm-scan.ts/cloud-scan.ts) und
// fileBacked === false (WP-5) — sie sind KEINE fehlenden Ordner und duerfen
// keine Problemkarte erzeugen. Einzige Filterwahrheit ist das Contract-Flag,
// bewusst KEIN pauschaler stale-Filter: ein dateibasierter stale-Eintrag
// (wirklich fehlender Ordner) bleibt eine echte Karte.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from '@playwright/test'
import type { AppData, ConfigEntry, System, Watcher } from '../../shared/contract'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'

test('B3: Katalog-Eintraege (llama-server, Ollama, gpt-4o) erzeugen keine Karte', () => {
  const cards = buildDiagnosisCards({ config: catalogConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(cards).toEqual([])
})

test('B3: echter fehlender Ordner (dateibasiert, stale) bleibt eine Karte mit konkretem Text', () => {
  const cards = buildDiagnosisCards({ config: missingFolderConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(cards).toHaveLength(1)
  const card = cards[0]
  expect(card.severityTone).toBe('warning')
  expect(card.title).toBe('mistral-7b.gguf (Modelle)')
  // Konkretes „Was ist betroffen" aus dem Eintrag, nicht die generische Floskel.
  expect(card.meaning).toContain('GGUF-Modell Mistral 7B')
  expect(card.meaning).not.toBe('Ein erwarteter Ordner, Eintrag oder Hinweis fehlt im aktuellen Check.')
})

test('B3: fehlender Cloud-API-Key wird Info-Karte „Key nicht gesetzt" mit Handlungsort', () => {
  const cards = buildDiagnosisCards({ config: missingKeyConfig(), system: readySystem(), watcher: readyWatcher(), errors: [] })
  expect(cards).toHaveLength(1)
  const card = cards[0]
  expect(card.severityTone).toBe('info')
  expect(card.meaning).toContain('Key nicht gesetzt')
  expect(card.how).toContain('OPENAI_API_KEY')
  expect(card.changeHint).toContain('OPENAI_API_KEY')
})

test('B3: Filter logik ist ausgelagert und verdrahtet (HR27-Split)', () => {
  const model = readFileSync(resolve(process.cwd(), 'src/renderer/sections/overview/diagnosis-model.ts'), 'utf8')
  expect(model).toContain("from './diagnosis-cards-filter'")
})

function endpointEntry(id: string, name: string, port: string): ConfigEntry {
  return {
    id,
    name,
    status: 'stale',
    scope: 'local',
    path: `http://127.0.0.1:${port}/v1`,
    desc: `${name} lokaler Endpoint (Standard-Port) — manueller Start, Erreichbarkeit wird nicht geprueft`,
    updated: '—',
    fileBacked: false,
    fields: { Port: port, Zustand: 'nicht geprueft (manueller Start)' }
  }
}

function modelCatalogEntry(): ConfigEntry {
  return {
    id: 'cloud-openai-gpt-4o',
    name: 'gpt-4o',
    status: 'stale',
    scope: 'global',
    path: 'https://api.openai.com/v1',
    desc: 'OpenAI-Modell (Beispiel)',
    updated: '',
    fileBacked: false,
    fields: { 'API-Basis': 'https://api.openai.com/v1' }
  }
}

function keyEntryMissing(): ConfigEntry {
  return {
    id: 'cloud-openai-key',
    name: 'OpenAI API-Key',
    status: 'stale',
    scope: 'global',
    path: 'https://api.openai.com/v1',
    desc: 'Nicht gesetzt — in OPENAI_API_KEY hinterlegen',
    updated: '',
    fileBacked: false,
    fields: { 'Env-Variable': 'OPENAI_API_KEY', Status: 'nicht gesetzt' }
  }
}

function missingFolderEntry(): ConfigEntry {
  return {
    id: 'gguf-mistral',
    name: 'mistral-7b.gguf',
    status: 'stale',
    scope: 'local',
    path: 'C:\\fixtures\\models\\mistral-7b.gguf',
    desc: 'GGUF-Modell Mistral 7B',
    updated: 'heute'
  }
}

function shell(data: AppData['data']): AppData {
  return {
    snapshot: { frozen: false, date: 'today', label: 'test' },
    machines: [],
    llms: [
      { id: 'local', glyph: '', name: 'Lokal', sub: '', color: '', path: '' },
      { id: 'cloud', glyph: '', name: 'Cloud-APIs', sub: '', color: '', path: '' }
    ],
    data
  }
}

function catalogConfig(): AppData {
  return shell({
    local: {
      duplicates: [],
      categories: [{
        id: 'endpoints', label: 'Endpoints', icon: '', path: '', blurb: '',
        entries: [endpointEntry('llama-server-8099', 'llama-server', '8099'), endpointEntry('ollama-11434', 'Ollama', '11434')]
      }]
    },
    cloud: {
      duplicates: [],
      categories: [{ id: 'cloud-openai', label: 'OpenAI', icon: '', path: '', blurb: '', entries: [modelCatalogEntry()] }]
    }
  })
}

function missingKeyConfig(): AppData {
  return shell({
    cloud: {
      duplicates: [],
      categories: [{ id: 'cloud-openai', label: 'OpenAI', icon: '', path: '', blurb: '', entries: [keyEntryMissing()] }]
    }
  })
}

function missingFolderConfig(): AppData {
  return shell({
    local: {
      duplicates: [],
      categories: [{ id: 'gguf-models', label: 'Modelle', icon: '', path: '', blurb: '', entries: [missingFolderEntry()] }]
    }
  })
}

function readySystem(): System {
  return {
    updated: 'today',
    areas: [{ id: 'runtime', label: 'Runtime', icon: 'gear', blurb: '', entries: [
      { id: 'node', name: 'Node', status: 'active', desc: 'laeuft' }
    ] }]
  }
}

function readyWatcher(): Watcher {
  return {
    daemon: { status: 'ready', lastResult: 'ok', schedule: 'daily', tokens: '0', sources: 1, updated: 'today', note: '' },
    tiers: [],
    sources: [{ name: 'Codex', kind: 'CLI', current: '1', latest: '1', tier: 1, state: 'current' }],
    changelogs: []
  }
}
