// index.ts — Provider-Registry (B-4). Default-Liste der Anbieter-Manifeste, die
// die generische Engine (scanProvider) iteriert. Reihenfolge = wie heute
// buildData() die Bestands-Scanner aufruft (scan-index.ts buildData:
// shared, claude, codex, local) -> die spaetere B-5-Verdrahtung kann die
// Registry in derselben Reihenfolge auf data[<id>] abbilden.
//
// ANDOCKPUNKT (UI/Owner): spaetere nutzerdefinierte Manifeste (rein deklarative
// CategorySpec, KEINE CustomCategory — Escape-Hatch bleibt built-in) werden hier
// angehaengt; die Engine verarbeitet sie ohne Codeaenderung mit.
import type { ProviderRegistry } from '@shared/contract-provider'
import { sharedManifest } from './shared.manifest'
import { claudeManifest } from './claude.manifest'
import { codexManifest } from './codex.manifest'
import { llmManifest } from './llm.manifest'
import { cloudManifest } from './cloud.manifest'

/**
 * Die Default-Provider-Registry. Die ersten vier (shared, claude, codex, local)
 * sind die Migrations-Gleichheits-gesperrten Bestands-Familien (B-5 bildet sie in
 * fixer Reihenfolge auf data[<id>] ab). `cloud` (Teil D) ist eine ADDITIVE neue
 * Familie (OpenAI/Anthropic/Gemini, metadaten-only, Key-Status maskiert) — sie
 * haengt hinten an und beruehrt die Gleichheit der Bestands-Familien nicht.
 * Nutzerdefinierte Laufzeit-Manifeste (D6) kommen zusaetzlich ueber scanRegistry()
 * (loadUserManifests), nicht hier — diese Liste bleibt die built-in Default-Quelle.
 */
export function providerRegistry(): ProviderRegistry {
  return [sharedManifest, claudeManifest, codexManifest, llmManifest, cloudManifest]
}
