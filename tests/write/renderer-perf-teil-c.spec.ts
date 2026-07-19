// renderer-perf-teil-c.spec.ts — Teilplan-C-Gates (Renderer-Performance):
// 1) Memoization: memoLast-Mechanik + Overview-Selektoren liefern bei identischen
//    Inputs dieselbe Referenz (keine Neuberechnung); locale ist Cache-Schluessel.
// 2) DOM-Obergrenze: der reine Windowing-Kern (virtual-range) rendert bei 5.000
//    Eintraegen ueber die gesamte Scrollstrecke < 200 Zeilen. Das Fenster
//    (end - start) ist exakt die Anzahl der von den Komponenten gemappten
//    DOM-Zeilen (indexes.map in config-parts/coverage/compare).
// 3) Chunk-Assert: alle neun Lazy-Sektionen/Views liegen als eigene Chunks in
//    out/renderer/assets und das Hauptbundle liegt unter der 600-KB-Schwelle
//    (Stand Teil C 491 kB + Marge; Baseline vor Teilplan C war 744 KB).
//    Fehlt der Build, wird er einmalig ausgefuehrt.
import { test, expect } from '@playwright/test'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AppData } from '../../shared/contract'
import { getLocale, setLocale } from '../../shared/messages'
import { memoLast } from '../../src/renderer/lib/memo-last'
import { initialVirtualRange, virtualRangeFor } from '../../src/renderer/lib/virtual-range'
import {
  selectCoverageEntries,
  selectDiagnosisCards,
  selectGuidedFlows,
  selectOverviewModel
} from '../../src/renderer/sections/overview/overview-selectors'

// --- 1) Memoization -----------------------------------------------------------

test('memoLast: gleiche Argumente -> gleiche Referenz, keine Neuberechnung', () => {
  let calls = 0
  const fn = memoLast((a: { id: number }, b: number) => {
    calls += 1
    return { sum: a.id + b }
  })
  const input = { id: 5 }
  const first = fn(input, 2)
  expect(fn(input, 2)).toBe(first)
  expect(calls).toBe(1)
  // Neue Objekt-Referenz (auch bei gleichem Inhalt) -> sauberer Cache-Miss.
  const third = fn({ id: 5 }, 2)
  expect(third).not.toBe(first)
  expect(third).toEqual(first)
  expect(calls).toBe(2)
})

function configFixture(): AppData {
  return { snapshot: { frozen: false, date: 'today', label: 'test' }, machines: [], llms: [], data: {} }
}

test('Overview-Selektoren: identische Inputs -> identische Referenzen (Re-Render-Nachweis)', () => {
  const config = configFixture()
  const model = selectOverviewModel(config, null, null, null, null, null, 'de')
  expect(selectOverviewModel(config, null, null, null, null, null, 'de')).toBe(model)

  const cards = selectDiagnosisCards(config, null, null, null, null, null, 'de')
  expect(selectDiagnosisCards(config, null, null, null, null, null, 'de')).toBe(cards)

  const flows = selectGuidedFlows(cards, 'de')
  expect(selectGuidedFlows(cards, 'de')).toBe(flows)

  const coverage = selectCoverageEntries(config)
  expect(selectCoverageEntries(config)).toBe(coverage)

  // Geaenderter Input -> neue Berechnung (kein stale Cache).
  expect(selectCoverageEntries(null)).not.toBe(coverage)
  expect(selectOverviewModel(config, null, null, 'Fehler', null, null, 'de')).not.toBe(model)
})

test('Overview-Selektoren: locale ist Cache-Schluessel und aendert den Text', () => {
  const prevLocale = getLocale()
  const config = configFixture()
  try {
    setLocale('de')
    const de = selectOverviewModel(config, null, null, null, null, null, 'de')
    setLocale('en')
    const en = selectOverviewModel(config, null, null, null, null, null, 'en')
    expect(en).not.toBe(de)
    expect(en.statusSummary).not.toBe(de.statusSummary)
    // Zurueck zu de: Cache-Miss (last-only), aber gleicher Text wie zuvor.
    setLocale('de')
    const deAgain = selectOverviewModel(config, null, null, null, null, null, 'de')
    expect(deAgain.statusSummary).toBe(de.statusSummary)
  } finally {
    setLocale(prevLocale)
  }
})

// --- 2) DOM-Obergrenze (5.000er-Fixture) --------------------------------------

// Die 4 realen Virtualisierungs-Konfigurationen des Renderers (Quelle vor Ort):
// ScopeGroup config-parts.tsx (>40), SearchRows config-parts.tsx (>80),
// CoverageVirtualTable (>80), CompareColumnVirtual (>160). overscan 6 ist der
// Default von useVirtualRows, wenn die Komponente keinen Wert uebergibt.
const VIRTUAL_CONFIGS = [
  { name: 'ScopeGroup (config-parts)', estimateSize: 118, overscan: 5 },
  { name: 'SearchRows (config-parts)', estimateSize: 68, overscan: 6 },
  { name: 'CoverageVirtualTable (coverage)', estimateSize: 58, overscan: 6 },
  { name: 'CompareColumnVirtual (compare)', estimateSize: 23, overscan: 20 }
] as const

for (const cfg of VIRTUAL_CONFIGS) {
  test(`virtualRangeFor ${cfg.name}: 5.000 Eintraege -> Fenster < 200 DOM-Zeilen`, () => {
    const count = 5000
    let maxRows = 0
    // Gesamte Scrollstrecke in ungeraden Schritten, normaler + grosser Viewport.
    for (const viewport of [900, 2160]) {
      for (let top = 0; top <= count * cfg.estimateSize; top += 7331) {
        const range = virtualRangeFor(top, viewport, count, cfg.estimateSize, cfg.overscan)
        expect(range.start).toBeGreaterThanOrEqual(0)
        expect(range.end).toBeLessThanOrEqual(count)
        expect(range.end).toBeGreaterThan(range.start)
        maxRows = Math.max(maxRows, range.end - range.start)
      }
    }
    expect(maxRows).toBeLessThan(200)
  })
}

test('virtualRangeFor: Fenster wandert mit und clamppt negativen Versatz', () => {
  const count = 5000
  const estimateSize = 118 // wie ScopeGroup (config-parts)
  // Fenster wandert wirklich: Mitte der Liste rendert mittlere Zeilen.
  const mid = virtualRangeFor((count * estimateSize) / 2, 900, count, estimateSize, 5)
  expect(mid.start).toBeGreaterThan(1000)
  // Negativer top (Liste oberhalb des Viewports) wird geclamppt.
  expect(virtualRangeFor(-500, 900, count, estimateSize, 5).start).toBe(0)
})

test('initialVirtualRange: unveraendertes Verhalten bei disabled / ohne Viewport', () => {
  expect(initialVirtualRange(5000, 118, 5, false, 900)).toEqual({ start: 0, end: 5000 })
  expect(initialVirtualRange(5000, 118, 5, true, null)).toEqual({ start: 0, end: 5000 })
  const initial = initialVirtualRange(5000, 118, 5, true, 900)
  expect(initial.end - initial.start).toBeLessThan(200)
})

// --- 3) Chunk-Assert ------------------------------------------------------------

const ASSETS = resolve(process.cwd(), 'out/renderer/assets')
// Schwelle: Stand Teil C 491 kB + Marge (Baseline vor Teilplan C war 744.438 B).
const MAIN_BUNDLE_BASELINE_BYTES = 600_000
// Alle Lazy-Sektionen/Views (App.tsx + ConfigSection.tsx). Prefixe stimmen mit
// den Rolldown-Chunk-Namen ueberein (verifiziert an out/renderer/assets).
const LAZY_CHUNK_PREFIXES = [
  'ReferenceSection-',
  'GraphSection-',
  'CompareView-',
  'CoverageView-',
  'TreeSection-',
  'StrukturSection-',
  'ArchivSection-',
  'UpdatesSection-',
  'OnboardingFlow-'
]

function jsFiles(): string[] {
  return existsSync(ASSETS) ? readdirSync(ASSETS).filter((f) => f.endsWith('.js')) : []
}

test('Lazy-Chunks existieren und Hauptbundle liegt unter der 600-KB-Schwelle', () => {
  test.setTimeout(300_000)
  // Build-Fallback: nur wenn die Lazy-Chunks fehlen (z.B. frischer Checkout).
  if (!LAZY_CHUNK_PREFIXES.every((prefix) => jsFiles().some((f) => f.startsWith(prefix)))) {
    execSync('pnpm build', { cwd: process.cwd(), stdio: 'inherit' })
  }
  const files = jsFiles()
  for (const prefix of LAZY_CHUNK_PREFIXES) {
    expect(
      files.some((f) => f.startsWith(prefix) && f.endsWith('.js')),
      `Lazy-Chunk ${prefix}*.js fehlt in out/renderer/assets`
    ).toBe(true)
  }
  const mainFiles = files.filter((f) => f.startsWith('index-'))
  expect(mainFiles.length).toBe(1)
  const mainSize = statSync(resolve(ASSETS, mainFiles[0])).size
  expect(mainSize).toBeLessThan(MAIN_BUNDLE_BASELINE_BYTES)
})
