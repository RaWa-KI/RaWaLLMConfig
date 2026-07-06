// cloud.manifest.ts — datengetriebenes Manifest fuer Cloud-APIs (Teil D, WP-D3).
// Metadaten-only Provider: KEINE lokalen Config-Wurzeln (roots: []), der Key liegt
// in einer Env-Variable. Die Engine laeuft dann mit synthetischer Basis '' (siehe
// scan-engine.runCategories) — die CustomCategorys ignorieren die Basis ohnehin.
//
// Pro Cloud-Provider EINE CustomCategory, die die fertige Category aus
// cloudCategories() (cloud-scan.ts) liefert. Reihenfolge: OpenAI, Anthropic,
// Gemini — exakt die Reihenfolge in CLOUD_PROVIDERS. KEIN manifest.endpoints
// (Cloud-Provider rufen nichts auf; apiBase ist reines Anzeige-Metadatum).
//
// Secret-Garantie 'secret-guarded': der Scanner liest nur die boolesche
// Env-Praesenz, nie einen Key-Wert (cloud-scan.ts haelt das hart durch).
//
// HINWEIS: KEINE Verdrahtung in manifests/index.ts oder scan-index.ts hier —
// das uebernimmt die Hauptsession. Diese Datei exportiert nur das Manifest.
import type { Category } from '@shared/contract'
import type { CustomCategory, ProviderManifest } from '@shared/contract-provider'
import { cloudCategories } from '../providers/cloud-scan'

// Je Provider eine CustomCategory, die die i-te Cloud-Category liefert. Index-
// Bindung haelt die Reihenfolge (OpenAI=0, Anthropic=1, Gemini=2) stabil.
function cloudCustom(index: number): CustomCategory {
  return { custom: (): Category => cloudCategories()[index] }
}

export const cloudManifest: ProviderManifest = {
  id: 'cloud',
  label: 'Cloud-APIs',
  roots: [],
  capabilities: ['secret-guarded'],
  categories: [cloudCustom(0), cloudCustom(1), cloudCustom(2)],
}
