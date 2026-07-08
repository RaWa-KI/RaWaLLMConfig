// llm.manifest.ts — datengetriebenes Manifest fuer lokale LLMs (B-4).
// BEIDE Kategorien sind CustomCategory:
//  - gguf-models: scanGgufFiles bildet die id ZWEISEGMENTIG
//    (`gguf-${modelDir}-${file}`, slugified, plus else-Zweig modelDir='gguf'
//    direkt unter Root) und sortiert (name.localeCompare). Die generische
//    Engine-id-Regel (`${idPrefix}-${name}`) reproduziert das NICHT.
//  - llm-endpoints: die statischen endpointEntries tragen id `llm-endpoints` und
//    label 'Inferenz-Endpoints' — die Engine-Endpoint-Kategorie waere
//    `local-endpoints`. Fidelity vor Eleganz -> als CustomCategory 1:1 geliefert
//    (KEIN manifest.endpoints, sonst entstuende eine abweichende ${id}-endpoints-
//    Kategorie zusaetzlich).
// Beide Customs bauen die Category-Huelle EXAKT wie scanLocalLlm (gleiche id/
// label/icon/path/blurb). Die GGUF-Suche kommt aus llm-scan: Env-/Home-Root,
// leichte externe Kandidaten und aktive lokale Nutzerquellen.
//
// HINWEIS B-5: scanLocalLlm hat einen comingSoon-Frueh-Return, wenn E: fehlt
// (leere categories). Das ist eine LlmConfig-Ebene (nicht Kategorie-Ebene) und
// bleibt buildData-/B-5-Sache; das Manifest deckt nur die Kategorien ab.
import type { Category } from '@shared/contract'
import type { CustomCategory, ProviderManifest } from '@shared/contract-provider'
import { GGUF_ROOT, scanGgufFiles, endpointEntries, LOCAL_DIFF_LABELS, ggufRoots } from '../llm-scan'

// gguf-models-Kategorie exakt wie scanLocalLlm (id/label/icon/path/blurb).
const ggufCategory: CustomCategory = {
  custom: (): Category => ({
    id: 'gguf-models',
    label: 'GGUF-Modelle',
    icon: 'list',
    path: ggufRoots().filter((root) => scanGgufFiles([root]).length > 0)[0] ?? GGUF_ROOT,
    blurb: 'Lokale Modelle fuer llama-server (read-only, nur Datei-Metadaten)',
    entries: scanGgufFiles(),
  }),
}

// llm-endpoints-Kategorie exakt wie scanLocalLlm (statische endpointEntries).
const endpointCategory: CustomCategory = {
  custom: (): Category => ({
    id: 'llm-endpoints',
    label: 'Inferenz-Endpoints',
    icon: 'api',
    path: 'http://127.0.0.1',
    blurb: 'Bekannte lokale OpenAI-kompatible Endpoints (manueller Start)',
    entries: endpointEntries(),
  }),
}

export const llmManifest: ProviderManifest = {
  id: 'local',
  label: 'Lokal',
  // GGUF_ROOT ist config-roots-unabhaengig (E:); fixedRoot haelt resolveRoots
  // stabil, auch wenn die Customs base ohnehin ignorieren.
  roots: [{ rootKey: 'projectRoot', fixedRoot: GGUF_ROOT }],
  capabilities: ['secret-guarded'],
  // Bestands-DiffLabels: scanLocalLlm setzt in JEDEM Zweig LOCAL_DIFF_LABELS.
  // Der comingSoon-Frueh-Return (E: fehlt) wird auf buildData-Ebene reproduziert.
  diffLabels: LOCAL_DIFF_LABELS,
  categories: [ggufCategory, endpointCategory],
}
