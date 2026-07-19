// build-data.ts — Registry-getriebener Familien-Scan (B-5). Ersetzt die vier
// hartcodierten scanX()-Aufrufe in scan-index.ts/buildData() durch Iteration der
// providerRegistry(): je Manifest scanProvider(manifest) -> data[manifest.id].
// Read-only, wirft nie (jeder Provider via safeScan gekapselt). HR27 (<300 Z,
// Fn <50 Z); scan-index.ts bleibt duenn (mergeMcp/userglobal/findDuplicates dort).
import { existsSync } from 'node:fs'
import type { LlmConfig } from '@shared/contract'
import type { ProviderManifest } from '@shared/contract-provider'
import { providerRegistry } from '../manifests'
import { loadUserManifests } from '../providers/manifest-loader'
import { scanProvider } from './scan-engine'
import { ggufRoots, LOCAL_DIFF_LABELS, LOCAL_COMING_SOON } from '../llm-scan'
import { isProviderScanEnabled } from '../integration-filter'
import { yieldToEventLoop } from '../../lib/yield-loop'

// Original-data-Key-Reihenfolge (scan-index.ts buildData, M1-Stand). findDuplicates/
// buildCoverage iterieren data -> Reihenfolge zaehlt. Die Registry-Array-
// Reihenfolge ist heute bereits identisch (shared, claude, codex, local); diese
// fixe Liste haelt die Gleichheit auch dann, wenn die Registry spaeter umsortiert
// oder nutzerdefinierte Manifeste anhaengt.
const DATA_ORDER = ['shared', 'claude', 'codex', 'local'] as const

// Leere, contract-konforme Familie als Fallback bei Scanner-Fehlern.
function emptyConfig(): LlmConfig {
  return { categories: [], duplicates: [] }
}

// Einzelnen Scan sicher ausfuehren: Fehler werden geloggt (ohne Secret), die App
// crasht nie. Bei Fehler -> leere Familie. Identisches Verhalten wie der bisherige
// safeScan in scan-index.ts (nur hierher gezogen).
function safeScan(name: string, fn: () => LlmConfig): LlmConfig {
  try {
    return fn()
  } catch (err) {
    console.error(`[scan:${name}]`, err instanceof Error ? err.message : 'scan-error')
    // A8-1: Fehlermarker mitgeben (nur Klartext-message, secret-frei, gekappt),
    // damit eine gecrashte Familie im Renderer nicht als "nichts konfiguriert"
    // (leere Familie) getarnt wird.
    return { ...emptyConfig(), scanError: err instanceof Error ? err.message.slice(0, 120) : 'scan-error' }
  }
}

function scanIfEnabled(manifest: ProviderManifest): LlmConfig {
  return isProviderScanEnabled(manifest.id)
    ? safeScan(manifest.id, () => scanProvider(manifest))
    : emptyConfig()
}

// Die llm-comingSoon-Bedingung des Bestands-Scanners (scanLocalLlm: bei fehlendem
// Modellroot LEERE categories + diffLabels + comingSoon) auf buildData-Ebene
// reproduzieren. Die Engine wuerde stattdessen 2 (leere) Kategorien liefern; bei
// fehlendem Modellroot muss data.local exakt der Frueh-Return-LlmConfig entsprechen.
// Anker: llm-scan.ts scanLocalLlm()-Frueh-Return (byte-identische Felder).
function applyLocalComingSoon(local: LlmConfig): LlmConfig {
  if (ggufRoots().some((root) => existsSync(root))) return local
  return {
    categories: [],
    duplicates: [],
    diffLabels: LOCAL_DIFF_LABELS,
    comingSoon: LOCAL_COMING_SOON,
    // A8-1: einen echten local-Scan-Crash NICHT durch den comingSoon-Zweig
    // maskieren — Fehlermarker nur durchreichen, wenn real vorhanden (kein
    // explizites scanError:undefined -> buildData-Gleichheit bleibt unberuehrt).
    ...(local.scanError ? { scanError: local.scanError } : {}),
  }
}

// Alle Familien ueber die Provider-Registry scannen und data in der Original-
// Schluessel-Reihenfolge (shared, claude, codex, local) aufbauen. mergeMcp/
// buildUserglobal bleiben Post-Steps des Aufrufers (scan-index.ts) — unveraendert.
export function scanRegistry(): Record<string, LlmConfig> {
  const registry = providerRegistry()
  const byId = new Map<string, ProviderManifest>()
  for (const manifest of registry) byId.set(manifest.id, manifest)
  const data: Record<string, LlmConfig> = {}
  // 1) Bestands-Familien in fixer Reihenfolge -> Migrations-Gleichheit (B-6).
  for (const id of DATA_ORDER) {
    const m = byId.get(id)
    data[id] = m ? scanIfEnabled(m) : emptyConfig()
  }
  // llm-comingSoon-Frueh-Return (LlmConfig-Ebene) reproduzieren (vor mergeMcp).
  data.local = applyLocalComingSoon(data.local)
  // 2) Additive neue Familien (Teil D): cloud + jedes weitere built-in Manifest,
  //    das nicht zu den Bestands-Familien gehoert. NACH den Legacy-4 -> die
  //    Gleichheit der Bestands-Familien bleibt unberuehrt.
  for (const m of registry) {
    if ((DATA_ORDER as readonly string[]).includes(m.id) || data[m.id]) continue
    data[m.id] = scanIfEnabled(m)
  }
  // 3) Nutzerdefinierte Laufzeit-Manifeste (D6), graceful (fehlendes Verzeichnis
  //    -> leer). Built-in gewinnt bei id-Kollision (kein Override der Bestaende).
  for (const m of loadUserManifests().manifests) {
    if (data[m.id]) continue
    data[m.id] = scanIfEnabled(m)
  }
  return data
}

// Async-Variante (Teilplan B): identischer Scan, identische Reihenfolge — aber
// VOR jedem Familien-Scan ein Event-Loop-Yield, damit der Main-Prozess waehrend
// des kalten Vollscans weiter IPC beantwortet (keine Eingabeblockade). Die
// Familien-Scanner selbst bleiben synchron (kein pauschaler I/O-Umbau).
export async function scanRegistryAsync(): Promise<Record<string, LlmConfig>> {
  const registry = providerRegistry()
  const byId = new Map<string, ProviderManifest>()
  for (const manifest of registry) byId.set(manifest.id, manifest)
  const data: Record<string, LlmConfig> = {}
  for (const id of DATA_ORDER) {
    await yieldToEventLoop()
    const m = byId.get(id)
    data[id] = m ? scanIfEnabled(m) : emptyConfig()
  }
  data.local = applyLocalComingSoon(data.local)
  for (const m of registry) {
    if ((DATA_ORDER as readonly string[]).includes(m.id) || data[m.id]) continue
    await yieldToEventLoop()
    data[m.id] = scanIfEnabled(m)
  }
  for (const m of loadUserManifests().manifests) {
    if (data[m.id]) continue
    await yieldToEventLoop()
    data[m.id] = scanIfEnabled(m)
  }
  return data
}
