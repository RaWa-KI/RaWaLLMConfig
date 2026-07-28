// scan-engine-multiroot-dedupe.spec.ts — B2-Regression: laeuft ein Manifest
// gegen MEHRERE Roots (Basis + aktive Nutzer-Quellen), duerfen Kategorien NICHT
// pro Root vervielfacht werden. Vor dem Fix lief runCategories pro Root ohne
// Dedupe: llm-Customs liefern byte-identische Kategorien (x N Roots), spec-
// basierte Kategorien tragen dieselbe id mit differierenden Eintraegen -> die
// Kategorien-Seitenleiste zeigte alles mehrfach.
// Vertrag nach Fix: Kategorien werden nach Category.id gemergt (erste Huelle
// gewinnt, Reihenfolge stabil), Eintraege vereinigt mit Dedupe nach Entry-id.
// Runner: Playwright (test/expect) als reiner Node-Test-Runner (kein Browser).
import { test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Category } from '../../shared/contract'
import type { CategorySpec, CustomCategory, ProviderManifest } from '../../shared/contract-provider'
import { scanProvider } from '../../src/main/scan/engine/scan-engine'

let sandboxRoot = ''
let rootA = ''
let rootB = ''

test.beforeEach(() => {
  sandboxRoot = mkdtempSync(join(tmpdir(), 'rawallm-multiroot-'))
  rootA = join(sandboxRoot, 'root-a')
  rootB = join(sandboxRoot, 'root-b')
  mkdirSync(rootA, { recursive: true })
  mkdirSync(rootB, { recursive: true })
})

test.afterEach(() => {
  try {
    rmSync(sandboxRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// (a) llm-Vorbild: eine CustomCategory, die die Basis ignoriert und je Root
// byte-identische Kategorien liefert (gguf-models/llm-endpoints-Muster).
const identicalCustom: CustomCategory = {
  custom: (): Category => ({
    id: 'llm-endpoints',
    label: 'Inferenz-Endpoints',
    icon: 'api',
    path: 'http://127.0.0.1',
    blurb: 'Statische Endpoints',
    entries: [
      {
        id: 'llama-server-8099',
        name: 'llama-server',
        status: 'stale',
        scope: 'local',
        path: 'http://127.0.0.1:8099/v1',
        desc: 'Endpoint',
        updated: '',
        fields: {},
      },
    ],
  }),
}

// (b) spec-basierte Kategorie: gleiche Category.id in beiden Roots, aber
// differierende Eintraege (a.txt nur in rootA, b.txt nur in rootB, shared.txt
// in beiden -> gleiche Entry-id, muss dedupliziert werden).
const fileSpec: CategorySpec = {
  id: 'models',
  label: 'Modelle',
  icon: 'list',
  blurb: 'Modell-Dateien',
  scan: 'file',
  parser: 'raw-preview',
  glob: '*.txt',
}

function multiRootManifest(): ProviderManifest {
  return {
    id: 'testprov',
    label: 'Test',
    roots: [{ fixedRoot: rootA }, { fixedRoot: rootB }],
    categories: [identicalCustom, fileSpec],
  }
}

test('identische CustomCategory in 2 Roots: genau 1 Kategorie, Eintraege dedupliziert', () => {
  const cfg = scanProvider(multiRootManifest())
  const customs = cfg.categories.filter((c) => c.id === 'llm-endpoints')
  expect(customs.length, 'CustomCategory wurde pro Root vervielfacht').toBe(1)
  expect(customs[0].entries.map((e) => e.id)).toEqual(['llama-server-8099'])
})

test('gleiche spec-Kategorie-id in 2 Roots: 1 Kategorie mit vereinigten Eintraegen', () => {
  writeFileSync(join(rootA, 'a.txt'), 'modell a\n', 'utf8')
  writeFileSync(join(rootA, 'shared.txt'), 'in beiden roots\n', 'utf8')
  writeFileSync(join(rootB, 'b.txt'), 'modell b\n', 'utf8')
  writeFileSync(join(rootB, 'shared.txt'), 'in beiden roots\n', 'utf8')

  const cfg = scanProvider(multiRootManifest())
  const models = cfg.categories.filter((c) => c.id === 'models')
  expect(models.length, 'spec-Kategorie wurde pro Root vervielfacht').toBe(1)
  // Entry-ids: `${manifest.id}-${spec.id}-${datei}` slugifiziert (category-runner).
  expect(models[0].entries.map((e) => e.id).sort()).toEqual([
    'testprov-models-a-txt',
    'testprov-models-b-txt',
    'testprov-models-shared-txt',
  ])
})
