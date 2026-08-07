// sys-scan-localllm-truth.spec.ts — WP2 (2026-07-28): eine Quellen-Wahrheit
// fuer lokale LLM-Quellen. Root-Cause: localLlmArea speiste sich allein aus
// ports.json (LLMS_ollama 'stale', „Ollama deinstalliert", Stand 2026-06-03),
// waehrend OLLAMA_* gesetzt und der Modellordner verbunden war — die App
// zeigte eine notFound-Karte trotz gesunder Quelle.
// Regel: die live erkannte/verbundene Quelle ist die fuehrende Wahrheit;
// ports.json ist Zusatzinfo (fileBacked === false) und aus KEINEM Pfad ein
// eigener Fehlergrund (weder Karte noch Warn-Zaehler).
import { test, expect } from '@playwright/test'
import type { System, Watcher } from '../../shared/contract'
import { localLlmArea, type LocalLiveEvidence } from '../../src/main/scan/sys-scan-ports'
import { buildDiagnosisCards } from '../../src/renderer/sections/overview/diagnosis-model'
import { buildOverviewModel } from '../../src/renderer/sections/overview/overview-model'

const PORTS_DOC = {
  ports: {
    LLMS_ollama: { port: 11434, protocol: 'http', service: 'ollama', host: '127.0.0.1', status: 'stale' },
    LLMS_llama_swap: { port: 8099, protocol: 'http', service: 'llama-swap-openai-v1-proxy', host: '127.0.0.1', status: 'active' }
  }
}

const LIVE: LocalLiveEvidence = { ollama: true, models: true }
const NONE: LocalLiveEvidence = { ollama: false, models: false }

test('WP2: Ordner/Env-Wahrheit schlaegt ports.json-Mismatch (stale -> active)', () => {
  const area = localLlmArea(PORTS_DOC, LIVE)
  const ollama = area.entries.find((entry) => entry.id === 'LLMS_ollama')
  expect(ollama?.status).toBe('active')
  expect(ollama?.desc).toContain('live erkannt')
  // Registry bleibt als Zusatzinfo sichtbar, ist aber kein Fehlerstatus mehr.
  expect(ollama?.fields?.['Registry-Status']).toBe('stale')
})

test('WP2: ohne Live-Evidenz bleibt der Registry-Status — aber nie ein Fehlergrund', () => {
  const area = localLlmArea(PORTS_DOC, NONE)
  const ollama = area.entries.find((entry) => entry.id === 'LLMS_ollama')
  expect(ollama?.status).toBe('stale')
  expect(ollama?.fileBacked).toBe(false)
  // Alle Registry-Eintraege sind Zusatzinfo (kein Karten-/Zaehler-Trigger).
  for (const entry of area.entries) expect(entry.fileBacked).toBe(false)
})

test('WP2: stale aus ports.json erzeugt KEINE Diagnosekarte, echter Ordner-stale schon', () => {
  const system: System = {
    updated: 'today',
    areas: [
      // Registry-Eintrag: stale, aber nicht live geprueft -> keine Karte.
      { id: 'localllm', label: 'Lokale LLM', icon: 'sparkle', blurb: '', entries: [
        { id: 'LLMS_ollama', name: 'ollama', status: 'stale', desc: 'http · 127.0.0.1 · stale', fileBacked: false }
      ] },
      // Echter, dateibasierter Befund bleibt eine Karte (kein Pauschal-Filter).
      { id: 'env', label: 'Env', icon: 'key', blurb: '', entries: [
        { id: 'real', name: 'real-folder', status: 'stale', desc: 'Ordner fehlt' }
      ] }
    ]
  }
  const cards = buildDiagnosisCards({ config: null, system, watcher: readyWatcher(), errors: [] })
  const ids = cards.map((card) => card.id)
  expect(ids).not.toContain('system-localllm-ollama')
  expect(ids).toContain('system-env-real-folder')
})

test('WP2: Warn-Zaehler ignoriert Registry-Eintraege (kein Phantom-Punkt im Stempel)', () => {
  const system: System = {
    updated: 'today',
    areas: [{ id: 'localllm', label: 'Lokale LLM', icon: 'sparkle', blurb: '', entries: [
      { id: 'LLMS_ollama', name: 'ollama', status: 'stale', desc: 'x', fileBacked: false },
      { id: 'node', name: 'Node', status: 'active', desc: 'laeuft' }
    ] }]
  }
  const model = buildOverviewModel({ config: null, system, watcher: readyWatcher(), errors: [] })
  const systemReadiness = model.readiness.find((row) => row.id === 'system')
  expect(systemReadiness?.tone).toBe('ready')
})

function readyWatcher(): Watcher {
  return {
    daemon: { status: 'ready', lastResult: 'ok', schedule: 'daily', tokens: '0', sources: 1, updated: 'today', note: '' },
    tiers: [],
    sources: [{ name: 'Codex', kind: 'CLI', current: '1', latest: '1', tier: 1, state: 'current' }],
    changelogs: []
  }
}
