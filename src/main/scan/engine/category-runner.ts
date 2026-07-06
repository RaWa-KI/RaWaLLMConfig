// category-runner.ts — fuehrt EINE CategorySpec gegen ihre aufgeloeste Basis aus
// und liefert eine Category (Ziel-Modell aus contract.ts, UNVERAENDERT). Kein
// anbieter-spezifischer Code: alles kommt aus der CategorySpec (id/label/icon/
// blurb/subdir/glob/scan/parser/withContent/desc/idPrefix) plus dem Manifest-
// Prefix-Fallback. id-Bildung reproduziert die Regel des jeweiligen Scanners:
//   - dir-Drill nutzt scanDirEntry/drillTeamEntry/drillPluginEntry (Codex/Claude),
//     deren id ueber dirEntry/`${idPrefix}-${name}` entsteht (Codex slugifiziert
//     in dirEntry, shared/claude tun es nicht — der jeweilige Helfer entscheidet).
//   - file-Eintraege bilden `${idPrefix}-${name}` (Codex-Form: slugified) bzw.
//     ueber die parsers-Map die Desc/Felder/Vorschau/searchKeys.
// Die Secret-Guard-Kette laeuft DURCH (readFileOnce/parsers/maskedPreview).
// Read-only, wirft nie. HR27 (<300 Z, Fn <50 Z).
import path from 'node:path'
import type { Category, ConfigEntry } from '@shared/contract'
import type { CategorySpec, ProviderManifest } from '@shared/contract-provider'
import { listDir, fileEntry, dirEntry, mtime } from '../codex-scan-helpers'
import { scanDirEntry } from '../codex-scan'
import { drillTeamEntry, drillPluginEntry } from '../scan-helpers'
import { readFileOnce } from '../file-read-once'
import { PARSERS } from './parsers'

// Effektiver id-Prefix einer Kategorie: CategorySpec.idPrefix gewinnt, sonst
// aus Provider.id + Kategorie-Kennung abgeleitet (`${providerId}-${specId}`).
function effectivePrefix(spec: CategorySpec, manifest: ProviderManifest): string {
  if (spec.idPrefix) return spec.idPrefix
  // Fallback: Provider-id + Spec-id (z.B. 'claude' + 'skills' -> 'claude-skills').
  return `${manifest.id}-${spec.id}`
}

// Glob auf die schmale Form '*.ext' reduzieren (mehr brauchen die Bestands-
// Kategorien nicht). Leerer/fehlender Glob = alle Dateien. Liefert ein Praedikat.
function globMatcher(glob?: string): (name: string) => boolean {
  if (!glob || glob === '*') return () => true
  const m = /^\*(\.[A-Za-z0-9.]+)$/.exec(glob)
  if (m) {
    const ext = m[1].toLowerCase()
    return (name) => name.toLowerCase().endsWith(ext)
  }
  // Unbekannte Glob-Form: exakter Basename-Vergleich (defensiv).
  return (name) => name === glob
}

// dir-Drill: je Unterordner ein Eintrag. teams/plugins drillen in ihre
// Definitionsdatei (drillTeamEntry/drillPluginEntry), alle anderen ueber
// scanDirEntry (Codex-Ordner-Drill). Nicht-Verzeichnisse je nach Glob als Datei.
function runDirCategory(base: string, spec: CategorySpec, idPrefix: string): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  const match = globMatcher(spec.glob)
  const withContent = spec.withContent === true
  const desc = spec.desc ?? 'Eintrag'
  for (const d of listDir(base)) {
    if (d.name.startsWith('.')) continue
    if (d.name === '_memory') continue
    if (d.isDirectory()) {
      const drilled = drillForKind(spec, base, d.name, idPrefix)
      entries.push(drilled ?? scanDirEntry(idPrefix, base, d.name, desc, withContent))
    } else if (match(d.name)) {
      entries.push(fileEntry(idPrefix, base, d.name, 'global', desc, withContent))
    }
  }
  return entries
}

// Spezial-Drill fuer Teams/Plugins (Definitionsdatei statt Ordner). Erkennung
// rein ueber CategorySpec.parser: 'json-keys' auf einer dir-Kategorie meint die
// JSON-Definitionsdatei (config.json/installed_plugins.json). Sonst null ->
// generischer scanDirEntry. teamsVsPlugins anhand subdir ('teams' vs. sonst).
function drillForKind(spec: CategorySpec, base: string, name: string, idPrefix: string): ConfigEntry | null {
  if (spec.parser !== 'json-keys') return null
  if (spec.subdir === 'teams') return drillTeamEntry(idPrefix, base, name)
  return drillPluginEntry(idPrefix, base, name)
}

// file-Kategorie: je Datei (Glob-gefiltert) ein Eintrag. Die parser-Map liefert
// Desc/Felder/Vorschau/searchKeys; id ueber `${idPrefix}-${name}` (Codex-Form:
// slugified — gleiche Regel wie fileEntry, hier zentral angewandt).
function runFileCategory(base: string, spec: CategorySpec, idPrefix: string): ConfigEntry[] {
  const entries: ConfigEntry[] = []
  const match = globMatcher(spec.glob)
  const parser = PARSERS[spec.parser]
  const fallbackDesc = spec.desc ?? 'Datei'
  for (const d of listDir(base)) {
    if (!d.isFile() || !match(d.name)) continue
    const abs = path.join(base, d.name)
    const snap = readFileOnce(abs)
    const id = `${idPrefix}-${d.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const base0: ConfigEntry = {
      id,
      name: d.name,
      status: 'active',
      scope: 'global',
      path: abs,
      desc: fallbackDesc,
      updated: snap?.mtimeIso ?? mtime(abs),
      fields: {},
    }
    if (parser && snap) applyParsed(base0, parser(abs, snap, fallbackDesc))
    entries.push(base0)
  }
  return entries
}

// Parser-Teil-Ergebnis additiv in den Basis-Eintrag mergen (fields gemerged).
function applyParsed(entry: ConfigEntry, parsed: ReturnType<NonNullable<(typeof PARSERS)[keyof typeof PARSERS]>>): void {
  if (parsed.desc) entry.desc = parsed.desc
  if (parsed.fields) entry.fields = { ...entry.fields, ...parsed.fields }
  if (parsed.code) entry.code = parsed.code
  if (parsed.searchKeys && parsed.searchKeys.length) entry.searchKeys = parsed.searchKeys
}

/**
 * Eine CategorySpec gegen ihre aufgeloeste Provider-Basis ausfuehren.
 *
 * @param base     aufgeloeste Provider-Basis (resolveRoots()-Ergebnis je Root).
 * @param spec     die deklarative Kategorie.
 * @param manifest das Manifest (nur fuer den idPrefix-Fallback).
 * @returns        Category (contract.ts) — leere entries wenn Ordner fehlt.
 */
export function runCategory(base: string, spec: CategorySpec, manifest: ProviderManifest): Category {
  const dirAbs = spec.subdir ? path.join(base, spec.subdir) : base
  const idPrefix = effectivePrefix(spec, manifest)
  const entries = spec.scan === 'dir'
    ? runDirCategory(dirAbs, spec, idPrefix)
    : runFileCategory(dirAbs, spec, idPrefix)
  return { id: spec.id, label: spec.label, icon: spec.icon, path: dirAbs, blurb: spec.blurb, entries }
}
