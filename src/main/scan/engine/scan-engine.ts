// scan-engine.ts — generische, datengetriebene Discovery-Engine (B-3-Keystone).
// Nimmt EIN ProviderManifest und bildet es auf das BESTEHENDE LlmConfig-Modell
// (contract.ts) ab — ohne anbieter-spezifischen Code. Sie ersetzt die N
// hartcodierten scanX(); B-5 verdrahtet sie spaeter in buildData()/scan-index.ts.
// In B-3 wird sie NICHT verdrahtet (alter Pfad laeuft unveraendert), nur vom
// Engine-Unit-Test ausgeuebt. Roots ueber resolveRoots() (sandbox-aware, keine
// realRoots()-Duplikation). Secret-Guard-Kette laeuft durch die Parser/Drills.
// Read-only, wirft nie. HR27 (<300 Z, Fn <50 Z).
import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import type { CategoryEntry, CustomCategory, EndpointSpec, ProviderManifest } from '@shared/contract-provider'
import { resolveRoots } from '../../services/config-roots'
import { runCategory } from './category-runner'

// Escape-Hatch erkennen: eine CustomCategory traegt die `custom`-Builder-Funktion
// (bespoke Bestands-Logik), eine CategorySpec nicht. Reihenfolge bleibt erhalten.
function isCustomCategory(c: CategoryEntry): c is CustomCategory {
  return typeof (c as CustomCategory).custom === 'function'
}

// Ein statischer Endpoint-Spec -> ConfigEntry (scope='local'). Bildet die
// handgepflegten Endpoint-Eintraege (llm-scan.ts:92-115) deklarativ nach: id/
// name/path(=url) direkt aus dem Spec, fields/desc/updated durchgereicht,
// status default 'stale' (llm-scan-Vorbild fuer reservierte/manuelle Endpoints).
function endpointEntry(ep: EndpointSpec): ConfigEntry {
  return {
    id: ep.id,
    name: ep.label,
    status: ep.status ?? 'stale',
    scope: 'local',
    path: ep.url,
    desc: ep.desc ?? '',
    updated: ep.updated ?? '',
    fields: ep.fields ?? {},
  }
}

// Endpoint-Kategorie bauen (falls das Manifest Endpoints traegt). Eine feste
// Kategorie 'endpoints' mit allen EndpointSpecs in Eingabe-Reihenfolge.
function endpointCategory(manifest: ProviderManifest): Category | null {
  const eps = manifest.endpoints
  if (!eps || eps.length === 0) return null
  return {
    id: `${manifest.id}-endpoints`,
    label: 'Inferenz-Endpoints',
    icon: 'api',
    path: eps[0]?.host ?? 'http://127.0.0.1',
    blurb: 'Bekannte lokale OpenAI-kompatible Endpoints (manueller Start)',
    entries: eps.map(endpointEntry),
  }
}

// Alle Kategorie-Specs des Manifests gegen ALLE aufgeloesten Roots ausfuehren.
// Reihenfolge: je Root in Eingabe-Reihenfolge, darin je CategorySpec in
// Manifest-Reihenfolge (deterministisch, wie die Bestands-Scanner). Ein
// Scan-Fehler EINER Kategorie verwirft nur diese Kategorie (Bestands-Verhalten:
// jeder Bestands-Scanner faengt je Kategorie ab und liefert die restlichen).
// A8-1: `errors` sammelt die Klartext-message jeder gecrashten Kategorie
// (secret-frei, gekappt). So bleibt der Teilausfall EINER Kategorie sichtbar
// (scanProvider leitet ihn als scanError weiter), ohne die restlichen Kategorien
// zu verwerfen (Bestands-Verhalten bleibt: geloggt + uebersprungen).
function runCategories(roots: string[], manifest: ProviderManifest, errors: string[]): Category[] {
  const out: Category[] = []
  // Metadaten-only Provider (Cloud, Teil D) haben keine Roots -> ein synthetischer
  // Lauf mit Basis '' (die CustomCategory ignoriert die Basis ohnehin).
  const bases = roots.length > 0 ? roots : ['']
  for (const base of bases) {
    for (const entry of manifest.categories) {
      const label = isCustomCategory(entry) ? 'custom' : entry.id
      try {
        out.push(isCustomCategory(entry) ? entry.custom(base, manifest) : runCategory(base, entry, manifest))
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 80) : 'scan-error'
        console.error('[scan:engine]', label, msg)
        errors.push(`${label}: ${msg}`)
      }
    }
  }
  return out
}

/**
 * Ein ProviderManifest scannen und als LlmConfig liefern (ProviderScanFn-Alias).
 *
 * categories = je (Root x CategorySpec) eine Category, plus optional die
 * Endpoint-Kategorie. duplicates bleibt wie heute je Scanner leer (dedupe-Stufe
 * spaeter). diffLabels werden 1:1 aus dem Manifest durchgereicht — die
 * Bestands-Scanner setzen familienspezifische DiffLabels (claude/codex/shared/
 * local), die so erhalten bleiben; fehlt das Feld -> undefined (wie heute).
 *
 * @param manifest das Anbieter-Manifest (Eingabe-Vertrag, contract-provider.ts).
 * @returns        LlmConfig (contract.ts) — UNVERAENDERTES Ziel-Modell.
 */
export function scanProvider(manifest: ProviderManifest): LlmConfig {
  try {
    const roots = resolveRoots(manifest.roots, manifest.id)
    const errors: string[] = []
    const categories = runCategories(roots, manifest, errors)
    const epCat = endpointCategory(manifest)
    if (epCat) categories.push(epCat)
    // A8-1: Teilausfall (einzelne Kategorie gecrasht) sichtbar machen — nur die
    // Klartext-messages, gekappt. Fehlt ein Fehler -> Feld bleibt weg (kein
    // scanError-Key), damit die buildData-Gleichheit unberuehrt bleibt.
    const scanError = errors.length > 0 ? errors.join(' · ').slice(0, 120) : undefined
    return { categories, duplicates: [], diffLabels: manifest.diffLabels, ...(scanError ? { scanError } : {}) }
  } catch (err) {
    // A8-1: Provider-Vollausfall — Fehlermarker mitgeben (secret-frei, gekappt),
    // damit die Familie nicht als "nichts konfiguriert" getarnt wird.
    const msg = err instanceof Error ? err.message.slice(0, 120) : 'unbekannt'
    console.error('[scan:engine]', 'fatal', msg)
    return { categories: [], duplicates: [], diffLabels: manifest.diffLabels, scanError: msg }
  }
}
