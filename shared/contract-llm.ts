// LLM-Familien-Teilvertrag — aus contract.ts extrahiert (HR27-Split, WP-5),
// damit contract.ts unter dem 300-Zeilen-Limit bleibt. contract.ts
// re-exportiert LlmConfig; bestehende Importe aus '@shared/contract' bleiben
// stabil. Type-only-Importe (zur Compile-Zeit geloescht -> kein Laufzeit-Zyklus).
import type { Category, ComingSoon, DiffLabels, DuplicateSet } from './contract'
import type { CoverageRow } from './contract-coverage'
import type { DriftRelation } from './contract-drift'

export interface LlmConfig {
  categories: Category[]
  duplicates: DuplicateSet[]
  driftRelations?: DriftRelation[]
  diffLabels?: DiffLabels
  comingSoon?: ComingSoon
  // Additiv-optional (A8-1): gesetzt, wenn der Familien-Scan real gecrasht ist
  // (Provider-Vollausfall). Traegt NUR die Klartext-Fehler-message (secret-frei,
  // gekappt) — kein Objekt-/Stack-Dump. Fehlt das Feld -> Scan lief fehlerfrei.
  // Unterscheidet einen echten Scan-Crash von "nichts konfiguriert" (leere
  // Familie ohne scanError). Renderer zeigt dafuer ein sichtbares Fehler-Signal.
  scanError?: string
  // Additiv-optional (WP-01): nur auf der 'shared'-Familie befuellt; fehlt das
  // Feld -> Renderer-Verhalten unveraendert. Enthaelt die Spiegelungs-Matrix
  // (Cross-Tool-Abdeckung Shared/Claude/Codex pro logischer Config).
  coverage?: CoverageRow[]
}
