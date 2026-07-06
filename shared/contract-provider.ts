// Provider-Manifest-Vertrag (deklarativ, datengetrieben) — Main + Renderer einig.
// Beschreibt einen LLM-Config-Anbieter (Claude/Codex/Shared/Local) als DATEN,
// damit eine generische Discovery-Engine (B-3) statt N hartcodierter scanX()
// darueber iteriert. Ziel-Output bleibt UNVERAENDERT das Modell aus contract.ts
// (Category/ConfigEntry/LlmConfig) — hier werden nur die EINGABE-Typen definiert.
// Secrets werden NIE getragen: ein Manifest enthaelt nur Pfade/Globs/Parser-Wahl
// und durchgereichte Garantien (capability 'secret-guarded'), keine Werte.

import type { Category, ConfigEntry, DiffLabels, LlmConfig } from './contract'

// ── Provider-Wurzel (deklarativ statt fixer String) ──────────────────────
// Begruendung: config-roots.ts loest die vier Wurzeln ueber configRoots() auf
// (claudeHome/codexHome/sharedClaude/projectRoot) und verlegt sie unter
// RAWALLM_SANDBOX_ROOT (config-roots.ts:33-51). Ein Manifest darf daher KEINEN
// absoluten String festschreiben, sondern nennt den ConfigRoots-Schluessel; die
// spaetere resolveRoots() (B-2) ruft configRoots() und greift das Feld ab —
// sandbox-Verlegung bleibt automatisch erhalten, ohne realRoots() zu duplizieren.
export type ConfigRootKey = 'claudeHome' | 'codexHome' | 'sharedClaude' | 'projectRoot'

export interface ProviderRoot {
  // Welche der vier configRoots()-Wurzeln diese Provider-Basis ist. Optional:
  // ein reiner `fixedRoot`-Provider (z.B. lokaler GGUF-Ordner) oder ein metadaten-only
  // Cloud-Provider (Teil D, Key in Env-Var, kein lokaler Config-Ordner) braucht
  // keinen ConfigRoots-Schluessel.
  rootKey?: ConfigRootKey
  // Optionaler Unterpfad unter der Wurzel (z.B. 'skills'); leer = Wurzel selbst.
  // CategorySpec.subdir bleibt relativ zu dieser aufgeloesten Basis.
  subPath?: string
  // Optionale feste Basis OHNE configRoots (z.B. llm-scan.ts GGUF_ROOT,
  // config-roots.ts-unabhaengig). Nur fuelllen, wenn die Wurzel KEINE der vier
  // Config-Wurzeln ist; resolveRoots() nimmt dann diesen Pfad direkt. Begruendung:
  // GGUF_ROOT liegt ausserhalb der Config-Wurzeln und wird nicht unter HOME verlegt.
  fixedRoot?: string
}

// ── Parser-Strategie je Kategorie (aus den echten Bausteinen abgeleitet) ──
export type ParserKind =
  // YAML-Frontmatter-Keys: parseFrontmatter/parseFrontmatterKeys (scan-helpers.ts:80,96).
  | 'frontmatter'
  // Rekursive JSON-Object.keys: extractSearchKeys (content-index.ts:151) fuer
  // *.json (settings/installed_plugins/package.json) — NUR Keys, nie Werte.
  | 'json-keys'
  // TOML-/env-Keys links von =/:: extractSearchKeys (content-index.ts) fuer
  // codex *.toml / config.toml.
  | 'toml-keys'
  // Verzeichnis-Drill in die Definitionsdatei: scanDirEntry (codex-scan.ts:180),
  // drillTeamEntry/drillPluginEntry (scan-helpers.ts:173,250) — Skills/Agents/
  // Teams/Plugins sind ORDNER, der Eintrag zeigt auf die innere Definitionsdatei.
  | 'dir-drill'
  // Statische Endpoint-Eintraege ohne Datei-Read: endpointEntries (llm-scan.ts:92).
  | 'endpoint'
  // Roh-Vorschau ohne Key-Parse: buildPreview/readPreview (scan-helpers.ts:49,63).
  | 'raw-preview'

// ── Durchgereichte Faehigkeit/Garantie eines Manifests ────────────────────
export type Capability =
  // 'secret-guarded': JEDE gelesene Datei laeuft durch isSecretPathForRead
  // (scan-helpers.ts:38) und maskSecrets (secret-mask.ts:266) — Secret-WERT-
  // Dateien werden maskiert/uebersprungen, nie roh getragen. Default-Pflicht.
  | 'secret-guarded'
  // 'mask': Inhalts-Vorschau wird maskiert geliefert (maskSecrets), wo gesetzt.
  | 'mask'
  // 'search-keys': ConfigEntry.searchKeys via extractSearchKeys befuellen.
  | 'search-keys'

// ── Eine scanbare Kategorie deklarativ ────────────────────────────────────
// Traegt, was heute A_CATEGORIES/D_SUBDIRS (shared-scan.ts:38,53), die Claude-
// Kategorien (claude-scan.ts:281) und die Codex-scanDir-Argumente (codex-scan.ts:
// 229) inline halten: id/label/icon/blurb + WIE gescannt wird (Glob ODER Drill).
export interface CategorySpec {
  // Stabile Kategorie-id (Ziel: Category.id). Beispiele: 'shared-agents',
  // 'codex-skills', 'skills'. Wird 1:1 als Category.id reproduziert.
  id: string
  // Optionaler id-Prefix fuer die ConfigEntry.id der Eintraege dieser Kategorie
  // (codex-scan.ts nutzt heute `codex-${sub}`). Fehlt er, leitet die Engine den
  // Prefix aus Provider.id + Kategorie ab.
  idPrefix?: string
  label: string // Category.label (z.B. 'Skills')
  icon: string // Category.icon (Slug, z.B. 'skill'/'agent'/'rule')
  blurb: string // Category.blurb (Kurzbeschreibung der Kategorie)
  // Unterordner unter der ProviderRoot, in dem die Kategorie liegt (z.B. 'skills',
  // 'agents'). Bei dir-drill wird je Unterordner gedrillt, bei Glob je Datei.
  subdir?: string
  // Datei-Glob fuer Einzeldatei-Kategorien (z.B. '*.toml', '*.md'); leer = alle.
  glob?: string
  // Scan-Modus: 'dir' = Ordner-Drill (Skills/Agents/Teams/Plugins),
  // 'file' = Einzeldatei-Eintraege. Deckt scanDir-Ordner UND fileEntry-Dateien ab.
  scan: 'dir' | 'file'
  // Parser fuer Desc/Frontmatter/searchKeys (siehe ParserKind).
  parser: ParserKind
  // withContent/content-Flag (codex-scan.ts:209, shared-scan.ts A_CATEGORIES):
  // true => Nicht-Secret-Textvorschau + Desc tragen; false => nur Zaehler/Struktur.
  withContent?: boolean
  // Optionaler Default-desc je Eintrag (codex-scan.ts uebergibt ihn, z.B.
  // 'Codex-Skill'); descFromPreview ueberschreibt bei vorhandenem Text.
  desc?: string
}

// ── Escape-Hatch fuer bespoke Bestands-Kategorien ─────────────────────────
// Manche Bestands-Kategorien bilden ids/Struktur, die die generische Engine
// NICHT 1:1 reproduziert: codex instructions/settings/hooks (Whitelist-Regex +
// strukturierte Einzeldatei-Logik), llm `gguf-${modelDir}-${file}` (zwei
// Segmente), shared plugin-agents / counter-Kategorien. Statt das Datenmodell
// oder HR27 zu sprengen (Plan-Abbruch-Kriterium), wrappt eine CustomCategory die
// bewaehrte Scanner-Logik und liefert die fertige Category -> Migrations-
// Gleichheit garantiert. NUR built-in (TS-Manifeste); nutzerdefinierte Laufzeit-
// JSON-Manifeste nutzen ausschliesslich die deklarative CategorySpec.
export interface CustomCategory {
  // Baut die Kategorie aus der aufgeloesten Provider-Basis (sandbox-aware) +
  // Manifest. Reihenfolge bleibt erhalten (Position in categories[]).
  custom: (base: string, manifest: ProviderManifest) => Category
}

// Ein Eintrag in ProviderManifest.categories: deklarativ (CategorySpec) ODER
// gewrappt (CustomCategory). Die Engine verarbeitet beide in Listen-Reihenfolge.
export type CategoryEntry = CategorySpec | CustomCategory

// ── Statischer Endpoint (LLM-Inferenz; llm-scan.ts:92-115) ────────────────
// Bildet die handgepflegten Endpoint-Eintraege ab: lokale 127.0.0.1-Endpoints
// mit Port/Backend/API. Wird zu einem ConfigEntry (scope='local') gemappt.
export interface EndpointSpec {
  id: string // ConfigEntry.id (z.B. 'llama-server-8099')
  label: string // ConfigEntry.name (z.B. 'llama-server')
  url: string // voller Endpoint -> ConfigEntry.path (z.B. 'http://127.0.0.1:8099/...')
  host?: string // optional separat (z.B. '127.0.0.1')
  port?: string // optional separat (z.B. '8099')
  desc?: string // ConfigEntry.desc
  updated?: string // ISO-Datum (handgepflegt)
  status?: ConfigEntry['status'] // z.B. 'active'/'stale'; default leitet Engine ab
  fields?: Record<string, string> // ConfigEntry.fields (Port/Backend/API)
}

// ── Das Manifest eines Anbieters ─────────────────────────────────────────
export interface ProviderManifest {
  // Anbieter-Schluessel; Quelle der ConfigEntry.id-/Category.id-Prefixe
  // ('claude' | 'codex' | 'shared' | 'local' bzw. custom).
  id: string
  label: string // sprechender Anbieter-Name (z.B. 'Claude')
  roots: ProviderRoot[] // Config-Wurzeln (siehe ProviderRoot); leer = metadaten-only (Cloud)
  categories: CategoryEntry[] // scanbare Kategorien (deklarativ ODER gewrappt) in stabiler Reihenfolge
  endpoints?: EndpointSpec[] // nur 'local': statische Inferenz-Endpoints
  capabilities?: Capability[] // durchgereichte Garantien (Default: ['secret-guarded'])
  // ── Cloud-Provider-Metadaten (Teil D, optional) ──────────────────────────
  // API-Basis-URL fuer Anzeige (z.B. 'https://api.openai.com/v1'). NUR Metadaten,
  // kein Auto-Call (die App ruft den Endpoint nie selbst auf).
  apiBase?: string
  // Env-Var-NAME des API-Keys (z.B. 'OPENAI_API_KEY') — NIE der Wert. Der Cloud-
  // Key-Lifecycle (D5) setzt/migriert in diese Var; der Cloud-Scanner zeigt nur
  // gesetzt/nicht-gesetzt (maskiert), liest den Wert nie. Bei nutzerdefinierten
  // Manifesten ist nur ein Env-NAME erlaubt, nie ein Inline-Wert (D6-Leitplanke).
  secretRef?: string
  // Statische DiffLabels (LlmConfig-Ebene) wie der Bestands-Scanner sie je Familie
  // setzt (claude/codex/shared/local). scanProvider() reicht sie 1:1 durch, damit
  // die buildData-Gleichheit auch die diffLabels umfasst. Fehlt das Feld
  // (nutzerdefinierte Manifeste) -> diffLabels: undefined, wie heute.
  diffLabels?: DiffLabels
}

// ── Registry (Vertrag fuer providerRegistry(), B-4) ───────────────────────
// Default-Liste der Anbieter-Manifeste; spaetere UI dockt nutzerdefinierte
// Manifeste an. B-3-Engine iteriert diese Liste und liefert je Manifest ein
// LlmConfig (Category[] + duplicates), exakt wie heute scanX().
export type ProviderRegistry = ProviderManifest[]

// ── Engine-Vertrag (informativ; Implementierung erst in B-3) ──────────────
// Signatur-Anker: die Engine bildet EIN Manifest auf das BESTEHENDE LlmConfig
// ab. Hier nur als Typ-Alias dokumentiert, KEINE Implementierung.
export type ProviderScanFn = (manifest: ProviderManifest) => LlmConfig

// Hilfs-Alias: ein einzelnes Scan-Resultat einer Kategorie (Engine-intern).
export type CategoryResult = Category
