// shared-scan-entries.ts — Eintrags-Mapping fuer den Shared-Scan.
// Ausgelagert aus shared-scan.ts (HR27-Split, Datei lag exakt auf 300 Z).
// Verantwortung: Datei-/Ordnername -> ConfigEntry (inkl. Drilldown, Vorschau,
// searchKeys) sowie die Plugin-Agenten-Eintraege. Kategorie-Aufbau und
// scanShared bleiben in shared-scan.ts. Verhalten UNVERAENDERT (reiner Move).
// LIEST nur das Dateisystem; schreibt/aendert NIE Config. Secrets werden nie
// getragen — nur Namen/Pfade/Metadaten.
import path from 'node:path'
import type { ConfigEntry } from '@shared/contract'
import { configRoots } from '../services/config-roots'
import { descFromPreview, enrichFieldsFromPreview } from './scan-helpers'
import { extractSearchKeysFromText } from './content-index'
import {
  PREVIEW_MAX_LINES,
  PREVIEW_MAX_CHARS,
  mtimeIso,
  listDirents,
  countDir,
  statKindSnap,
  previewFromText,
  drillDirDefinition,
} from './shared-scan-extras'

// Trunk-Pfad aus der Single Source (Default = realer .shared/.claude, M1
// unveraendert; mit RAWALLM_SANDBOX_ROOT = <sandbox>/.shared/.claude).
export function sharedDir() {
  return configRoots().sharedClaude ?? ''
}

// Einen Dateinamen/Ordnernamen zu einem ConfigEntry mappen (scope=shared).
// withContent=true => fuer Nicht-Secret-Textdateien Vorschau + Desc tragen.
// W1-Fix: Verzeichnis-Eintraege drillen jetzt in ihre Definitionsdatei, damit
// entry.path auf eine DATEI zeigt (readFull funktioniert) und entry.code gesetzt ist.
// WP17: EIN readFileOnce-Snapshot je Datei (statKindSnap) — groesse/updated/
// Preview/searchKeys teilen sich Text + Metadaten (vorher je Verbraucher
// eigener stat/Read). Drill-Eintraege nutzen den Snapshot der Definitionsdatei.
export function toEntry(catId: string, dirAbs: string, name: string, withContent: boolean): ConfigEntry {
  const abs = path.join(dirAbs, name)
  const { kind, size, snap } = statKindSnap(abs)
  const fields: Record<string, string> = { typ: kind }
  if (size) fields.groesse = size
  const fallbackDesc = kind === 'dir' ? 'Ordner' : 'Datei'
  const entry: ConfigEntry = {
    id: `${catId}-${name}`,
    name,
    status: 'active',
    scope: 'shared',
    path: abs,
    desc: fallbackDesc,
    updated: snap ? snap.mtimeIso : mtimeIso(abs),
    fields
  }

  if (withContent && kind === 'dir') {
    // W1-Fix: Drilldown auf Definitionsdatei; path + code auf die DATEI setzen
    const drilled = drillDirDefinition(abs)
    if (drilled) {
      entry.path = drilled.file  // Datei, nicht Ordner -> readFull funktioniert
      entry.code = drilled.preview
      entry.desc = descFromPreview(drilled.preview, fallbackDesc)
      enrichFieldsFromPreview(fields, drilled.preview)
      entry.updated = drilled.mtimeIso
      // searchKeys aus dem VOLLEN Drill-Text (nie aus der gekuerzten Preview)
      attachSearchKeys(entry, drilled.text)
    } else {
      // Kein Definitionsdatei-Treffer: Ordner-Zaehlfeld setzen
      fields.eintraege = String(countDir(abs))
      attachSearchKeys(entry)
    }
    return entry
  }

  if (withContent && kind === 'file') {
    const preview = previewFromText(abs, snap?.text, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS)
    if (preview) {
      entry.code = preview
      entry.desc = descFromPreview(preview, fallbackDesc)
      enrichFieldsFromPreview(fields, preview)
    }
  }
  attachSearchKeys(entry, snap?.text)
  return entry
}

// Plugin-Agenten sind ebenfalls Shared-Trunk-Quellen, liegen aber nicht im
// zentralen agents/-Ordner. Fuer die Coverage-Achse bekommen sie den Namen der
// Codex-Adapterdatei (<plugin>-<agent>.toml), damit sie mit ~/.codex/agents
// korrekt gepaart werden.
export function pluginAgentEntries(): ConfigEntry[] {
  const pluginsAbs = path.join(sharedDir(), 'plugins')
  const entries: ConfigEntry[] = []
  for (const plugin of listDirents(pluginsAbs)) {
    if (!plugin.isDirectory()) continue
    const agentsAbs = path.join(pluginsAbs, plugin.name, 'agents')
    for (const agent of listDirents(agentsAbs)) {
      if (!agent.isFile() || !/\.md$/i.test(agent.name)) continue
      const base = agent.name.replace(/\.md$/i, '')
      const entry = toEntry('shared-plugin-agent', agentsAbs, agent.name, true)
      entry.id = `shared-plugin-agent-${plugin.name}-${base}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      entry.name = `${plugin.name}-${base}.toml`
      entry.desc = entry.desc === 'Datei' ? `Plugin-Agent ${plugin.name}:${base}` : entry.desc
      entry.fields = {
        ...entry.fields,
        typ: 'plugin-agent',
        Plugin: plugin.name,
        Agent: base,
        Adapter: entry.name,
      }
      entries.push(entry)
    }
  }
  return entries
}

// searchKeys aus entry.path (Datei nach Drilldown) befuellen — Keys/Struktur,
// nie Werte; content-index maskiert Secret-Pfade vor der Extraktion (dort ist
// text nie gesetzt). text (WP17): vorgelesener Snapshot-Text, spart Zweit-Read.
function attachSearchKeys(entry: ConfigEntry, text?: string): void {
  const searchKeys = extractSearchKeysFromText(entry.path, text)
  if (searchKeys.length) entry.searchKeys = searchKeys
}
