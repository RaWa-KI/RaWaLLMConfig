// shared-scan.ts — Trunk-Kanonik (.shared/.claude) read-only scannen.
// Scope-Filter A-D aus ZIELE 2.3: A=volle Karten (agents/rules/skills/hooks/
// plugins/tools), C=Kontext (references/registry), D=nur Zaehler (coordination-
// Unterordner). B (changelogs/tracking) gehoert in den Watcher (sys-scan), nicht
// hier. LIEST nur das Dateisystem zur Laufzeit; schreibt/aendert NIE Config.
// Secrets werden nie getragen — nur Namen/Pfade/Metadaten.
// Inhalt (entry.code) nur fuer Nicht-Secret-Textquellen aus agents/rules/skills/
// tools/references. coordination (D), plugins, hooks bleiben Name/Zaehler-only.
import path from 'node:path'
import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import { diffLabels } from '@shared/dup-labels'
import { configRoots } from '../services/config-roots'
import { descFromPreview, enrichFieldsFromPreview } from './scan-helpers'
import { extractSearchKeysFromText } from './content-index'
import {
  PREVIEW_MAX_LINES,
  PREVIEW_MAX_CHARS,
  isSecretHint,
  mtimeIso,
  listDir,
  listDirents,
  countDir,
  statKindSnap,
  previewFromText,
  drillDirDefinition,
} from './shared-scan-extras'

// Trunk-Pfad aus der Single Source (Default = realer .shared/.claude, M1
// unveraendert; mit RAWALLM_SANDBOX_ROOT = <sandbox>/.shared/.claude).
const configuredSharedDir = configRoots().sharedClaude
const sharedDir = configuredSharedDir ?? ''

// Sichtbare Spalten-Anker (Quelle->Ziel->Wirkung) zentral aus dup-labels:
// die zentrale Version (Shared) gegenueber der lokalen Workspace-Kopie.
const SHARED_DIFF_LABELS = diffLabels('workspace')

// Scope-Filter A: volle Karten. Slug-Icon je Kategorie (kein Magic-String inline).
// content=true => Textquellen duerfen als Vorschau getragen werden (nicht-secret).
const A_CATEGORIES: ReadonlyArray<
  { id: string; dir: string; label: string; icon: string; blurb: string; content: boolean }
> = [
  { id: 'shared-agents', dir: 'agents', label: 'Agents', icon: 'agent', blurb: 'Cross-WS Subagenten (zentral)', content: true },
  { id: 'shared-rules', dir: 'rules', label: 'Rules', icon: 'rule', blurb: 'Kanonische Verhaltensregeln', content: true },
  { id: 'shared-skills', dir: 'skills', label: 'Skills', icon: 'skill', blurb: 'Cross-WS Skills (zentral)', content: true },
  // Owner-Override #1/#2: hooks (.cjs roh ok) + plugins (README/Manifest-Drilldown)
  // tragen jetzt Inhalt statt "Keine Rohkonfiguration".
  { id: 'shared-hooks', dir: 'hooks', label: 'Hooks', icon: 'hook', blurb: 'Cross-WS Hooks (zentral)', content: true },
  { id: 'shared-plugins', dir: 'plugins', label: 'Plugins', icon: 'plug', blurb: 'Cross-WS Plugins (zentral)', content: true },
  { id: 'shared-tools', dir: 'tools', label: 'Tools', icon: 'gear', blurb: 'Cross-WS Tools/Validatoren', content: true }
]

// Scope-Filter D: Zaehler-Eintraege je Unterordner (D_SUBDIRS).
// W8-Fix: profiles/shared/changelog/tracking ergaenzt (fehlten bisher).
const D_SUBDIRS: ReadonlyArray<string> = [
  'briefings', 'signals', 'audits', 'health', 'reports', 'notes',
  'security', 'templates', 'profiles', 'shared', 'changelog', 'tracking'
]

// Einen Dateinamen/Ordnernamen zu einem ConfigEntry mappen (scope=shared).
// withContent=true => fuer Nicht-Secret-Textdateien Vorschau + Desc tragen.
// W1-Fix: Verzeichnis-Eintraege drillen jetzt in ihre Definitionsdatei, damit
// entry.path auf eine DATEI zeigt (readFull funktioniert) und entry.code gesetzt ist.
// WP17: EIN readFileOnce-Snapshot je Datei (statKindSnap) — groesse/updated/
// Preview/searchKeys teilen sich Text + Metadaten (vorher je Verbraucher
// eigener stat/Read). Drill-Eintraege nutzen den Snapshot der Definitionsdatei.
function toEntry(catId: string, dirAbs: string, name: string, withContent: boolean): ConfigEntry {
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
function pluginAgentEntries(): ConfigEntry[] {
  const pluginsAbs = path.join(sharedDir, 'plugins')
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

// Scope-Filter A: eine volle Karte je Verzeichnis mit Datei-/Ordner-Entries.
function buildACategory(def: (typeof A_CATEGORIES)[number]): Category | null {
  const dirAbs = path.join(sharedDir, def.dir)
  const names = listDir(dirAbs)
  const entries = names.map((n) => toEntry(def.id, dirAbs, n, def.content))
  if (def.id === 'shared-agents') entries.push(...pluginAgentEntries())
  if (entries.length === 0) return null
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return { id: def.id, label: def.label, icon: def.icon, path: dirAbs, blurb: def.blurb, entries }
}

// Kanonische Anthropic-/Codex-Instruction-Dateien im .shared/.claude/-Root.
// Whitelist: nur CLAUDE.md, CLAUDE.local.md, AGENTS.md.
// Overview.md/INDEX.md/ROUTER.md sind normale Docs und werden hier nicht aufgefuehrt.
const INSTRUCTION_WHITELIST = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'])

function buildInstructions(): Category | null {
  const entries: ConfigEntry[] = []
  for (const d of listDirents(sharedDir)) {
    if (!d.isFile()) continue
    if (!INSTRUCTION_WHITELIST.has(d.name)) continue
    if (isSecretHint(path.join(sharedDir, d.name))) continue
    entries.push(toEntry('shared-instr', sharedDir, d.name, true))
  }
  if (entries.length === 0) return null
  return {
    id: 'shared-instructions',
    label: 'Instructions',
    icon: 'list',
    path: sharedDir,
    blurb: 'Kanonische Instruction-Dateien (CLAUDE.md / AGENTS.md)',
    entries
  }
}

// Scope-Filter C: references/** als Eintraege mit Inhalts-Vorschau (read-only).
// W1-Fix: Unterordner-Eintraege drillen jetzt in ihre Definitionsdatei.
function buildReferences(): Category | null {
  const dirAbs = path.join(sharedDir, 'references')
  const names = listDir(dirAbs)
  if (names.length === 0) return null
  const entries = names.map((n) => toEntry('shared-references', dirAbs, n, true))
  return {
    id: 'shared-references', label: 'References', icon: 'list', path: dirAbs,
    blurb: 'Read-only Referenz-/Kontext-Dokumente', entries
  }
}

// Scope-Filter C: coordination/registry als aufgelistete Eintraege (kein Inhalt).
function buildRegistry(): Category | null {
  const dirAbs = path.join(sharedDir, 'coordination', 'registry')
  const names = listDir(dirAbs)
  if (names.length === 0) return null
  const entries = names.map((n) => toEntry('shared-registry', dirAbs, n, false))
  return {
    id: 'shared-registry', label: 'Registry', icon: 'list', path: dirAbs,
    blurb: 'Workspace-/Port-/Dependency-Registry', entries
  }
}

// Scope-Filter D: ein Sammel-Entry je Unterordner mit reiner Anzahl (kein Read).
// W8-Fix: D_SUBDIRS enthaelt jetzt auch profiles/shared/changelog/tracking.
function buildCoordinationCounters(): Category | null {
  const coordAbs = path.join(sharedDir, 'coordination')
  const entries: ConfigEntry[] = D_SUBDIRS.map((sub) => {
    const subAbs = path.join(coordAbs, sub)
    const n = countDir(subAbs)
    return {
      id: `shared-coord-${sub}`,
      name: sub,
      status: 'active',
      scope: 'shared',
      path: subAbs,
      desc: `${n} Eintraege (nur Zaehler)`,
      updated: mtimeIso(subAbs),
      fields: { anzahl: String(n) }
    }
  })
  if (entries.length === 0) return null
  return {
    id: 'shared-coordination', label: 'Coordination', icon: 'list', path: coordAbs,
    blurb: 'Inventar-Zaehler (ausserhalb Config-Scope)', entries
  }
}

// B-4: additive Exporte fuer die datengetriebenen Manifest-CustomCategories.
// NUR Sichtbarmachung der bewaehrten Bestands-Funktionen — Logik UNVERAENDERT.
// A_CATEGORIES + buildACategory bilden je A-Karte (inkl. pluginAgentEntries +
// sort) die FERTIGE Category; build*(): Instructions/References/Registry/Counter.
export {
  sharedDir,
  A_CATEGORIES,
  buildACategory,
  buildInstructions,
  buildReferences,
  buildRegistry,
  buildCoordinationCounters,
}

// Trunk-Kanonik scannen: A (volle Karten) + Instructions + C (references/registry) + D (Zaehler).
// B (changelogs/tracking) bewusst ausgelassen — gehoert in den Watcher.
export function scanShared(): LlmConfig {
  if (!configuredSharedDir) return {
    categories: [{
      id: 'shared-root-not-configured', label: 'Shared', icon: 'warning', path: '',
      blurb: 'Shared-Konfiguration ist nicht eingerichtet.',
      entries: [{ id: 'shared-root-not-configured', name: 'Shared-Ordner nicht eingerichtet', status: 'stale', scope: 'shared', path: '', desc: 'Nicht konfiguriert — bitte in Einstellungen einen Shared-Ordner waehlen.', updated: '' }]
    }], duplicates: [], diffLabels: SHARED_DIFF_LABELS
  }
  const categories: Category[] = []
  for (const def of A_CATEGORIES) {
    try {
      const cat = buildACategory(def)
      if (cat) categories.push(cat)
    } catch (err) {
      console.error('[scan:shared-A]', err instanceof Error ? err.message : 'scan-error')
    }
  }
  // W8-Fix: Instructions-Kategorie (Top-Level .md-Dateien, z.B. Overview.md)
  try {
    const instrCat = buildInstructions()
    if (instrCat) categories.push(instrCat)
  } catch (err) {
    console.error('[scan:shared-instr]', err instanceof Error ? err.message : 'scan-error')
  }
  const builders: ReadonlyArray<{ name: string; fn: () => Category | null }> = [
    { name: 'references', fn: buildReferences },
    { name: 'registry', fn: buildRegistry },
    { name: 'coordination', fn: buildCoordinationCounters }
  ]
  for (const b of builders) {
    try {
      const cat = b.fn()
      if (cat) categories.push(cat)
    } catch (err) {
      console.error(`[scan:shared-${b.name}]`, err instanceof Error ? err.message : 'scan-error')
    }
  }
  return { categories, duplicates: [], diffLabels: SHARED_DIFF_LABELS }
}
