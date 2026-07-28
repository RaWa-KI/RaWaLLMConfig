// kimi.manifest.ts — datengetriebenes Manifest fuer ~/.kimi-code (Kimi-CLI).
// HR16-Paritaet: Claude, Codex und Kimi sind gleichwertige native Loader; bisher
// kannte die App vom Kimi-Loader nur die Skills aus ~/.agents. Aufbau strikt nach
// claude.manifest/codex.manifest: bespoke Kategorien als CustomCategory
// (instructions/settings/credentials, siehe kimi-cats.ts), Ordner-/Datei-
// Kategorien deklarativ als CategorySpec (hooks/workspaces) wie codex.manifest.
//
// ROOT-BESONDERHEIT: ConfigRoots fuehrt (noch) keinen `kimiHome`-Schluessel — der
// Vier-Wurzel-Vertrag von config-roots ist Bestand und bleibt unberuehrt. Statt
// dessen liefert `roots` ueber einen Getter bei JEDEM Zugriff einen `fixedRoot`
// aus kimiHome(); dadurch bleibt die RAWALLM_SANDBOX_ROOT-Verlegung erhalten
// (kimiHome liest configRoots() pro Aufruf), ohne realRoots() zu duplizieren.
import type { CategorySpec, ProviderManifest, ProviderRoot } from '@shared/contract-provider'
import { kimiHome, kimiInstructions, kimiSettings, kimiCredentials } from './kimi-cats'

// Deklarative dir-Kategorie nach codex.manifest-Vorbild (scan:'dir' => Engine
// nutzt scanDirEntry fuer Ordner + fileEntry fuer Dateien).
function dirSpec(sub: string, label: string, icon: string, desc: string): CategorySpec {
  return {
    id: `kimi-${sub}`,
    idPrefix: `kimi-${sub}`,
    label,
    icon,
    blurb: `kimiDir/${sub}/*`,
    subdir: sub,
    scan: 'dir',
    parser: 'frontmatter',
    withContent: true,
    desc,
  }
}

// Deklarative file-Kategorie: Einzeldateien der Wurzel nach Glob. parser
// 'json-keys' => nur Keys/Struktur + (bei Secret-Klasse) maskierte Vorschau.
function fileSpec(id: string, label: string, icon: string, glob: string, blurb: string, desc: string): CategorySpec {
  return {
    id: `kimi-${id}`,
    idPrefix: `kimi-${id}`,
    label,
    icon,
    blurb,
    scan: 'file',
    glob,
    parser: 'json-keys',
    withContent: false,
    desc,
  }
}

export const kimiManifest: ProviderManifest = {
  id: 'kimi',
  label: 'Kimi',
  // Getter statt fixem Array: pro Zugriff sandbox-aware aufgeloest (s. Kopf).
  get roots(): ProviderRoot[] {
    return [{ fixedRoot: kimiHome() }]
  },
  capabilities: ['secret-guarded'],
  // Kein diffLabels: diffLabels() kennt nur claude/codex/workspace; der Kimi-
  // Loader hat (noch) keine zentrale Shared-Gegenseite -> Feld bleibt undefined,
  // wie bei nutzerdefinierten Manifesten.
  categories: [
    { custom: (base: string) => kimiInstructions(base) },
    { custom: (base: string) => kimiSettings(base) },
    { custom: (base: string) => kimiCredentials(base) },
    dirSpec('hooks', 'Hooks', 'hook', 'Kimi-Hook-Skript'),
    fileSpec('workspaces', 'Workspaces', 'list', '*.json', 'workspaces.json u. a. JSON-Config der Wurzel', 'Kimi-JSON-Konfiguration'),
  ],
}

// Lesbarkeits-Anker fuer Tests (aufgeloeste Kimi-Wurzel).
export { kimiHome as kimiManifestRoot }
