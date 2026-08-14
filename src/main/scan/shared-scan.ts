// shared-scan.ts — Trunk-Kanonik (.shared/.claude) read-only scannen.
// Scope-Filter A-D aus ZIELE 2.3: A=volle Karten (agents/rules/skills/hooks/
// plugins/tools), C=Kontext (references/registry), D=nur Zaehler (coordination-
// Unterordner). B (changelogs/tracking) gehoert in den Watcher (sys-scan), nicht
// hier. LIEST nur das Dateisystem zur Laufzeit; schreibt/aendert NIE Config.
// Secrets werden nie getragen — nur Namen/Pfade/Metadaten.
// Inhalt (entry.code) nur fuer Nicht-Secret-Textquellen aus agents/rules/skills/
// tools/references. coordination (D), plugins, hooks bleiben Name/Zaehler-only.
// Eintrags-Mapping (sharedDir/toEntry/pluginAgentEntries) liegt seit dem
// HR27-Split in shared-scan-entries.ts.
import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import { diffLabels } from '@shared/dup-labels'
import { sharedDir, toEntry, pluginAgentEntries } from './shared-scan-entries'
import {
  isSecretHint,
  mtimeIso,
  listDir,
  listDirents,
  countDir,
} from './shared-scan-extras'

// Sichtbare Spalten-Anker (Quelle->Ziel->Wirkung) zentral aus dup-labels:
// die zentrale Version (Shared) gegenueber der lokalen Workspace-Kopie.
const SHARED_DIFF_LABELS = diffLabels('workspace')

// Scope-Filter A: volle Karten. Slug-Icon je Kategorie (kein Magic-String inline).
// content=true => Textquellen duerfen als Vorschau getragen werden (nicht-secret).
// expected=true (B11): Soll-Trunk — bleibt auch leer sichtbar, solange der Parent existiert.
const A_CATEGORIES: ReadonlyArray<{ id: string; dir: string; label: string; icon: string; blurb: string; content: boolean; expected: boolean }> = [
  { id: 'shared-agents', dir: 'agents', label: 'Agents', icon: 'agent', blurb: 'Cross-WS Subagenten (zentral)', content: true, expected: true },
  { id: 'shared-rules', dir: 'rules', label: 'Rules', icon: 'rule', blurb: 'Kanonische Verhaltensregeln', content: true, expected: true },
  { id: 'shared-skills', dir: 'skills', label: 'Skills', icon: 'skill', blurb: 'Cross-WS Skills (zentral)', content: true, expected: true },
  // Owner-Override #1/#2: hooks (.cjs roh ok) + plugins (README/Manifest-Drilldown)
  // tragen jetzt Inhalt statt "Keine Rohkonfiguration".
  { id: 'shared-hooks', dir: 'hooks', label: 'Hooks', icon: 'hook', blurb: 'Cross-WS Hooks (zentral)', content: true, expected: true },
  { id: 'shared-plugins', dir: 'plugins', label: 'Plugins', icon: 'plug', blurb: 'Cross-WS Plugins (zentral)', content: true, expected: true },
  { id: 'shared-tools', dir: 'tools', label: 'Tools', icon: 'gear', blurb: 'Cross-WS Tools/Validatoren', content: true, expected: true }
]

// Scope-Filter D: Zaehler-Eintraege je Unterordner (D_SUBDIRS).
// W8-Fix: profiles/shared/changelog/tracking ergaenzt (fehlten bisher).
const D_SUBDIRS: ReadonlyArray<string> = [
  'briefings', 'signals', 'audits', 'health', 'reports', 'notes',
  'security', 'templates', 'profiles', 'shared', 'changelog', 'tracking'
]

// Scope-Filter A: eine volle Karte je Verzeichnis mit Datei-/Ordner-Entries.
function buildACategory(def: (typeof A_CATEGORIES)[number]): Category | null {
  const dirAbs = path.join(sharedDir(), def.dir)
  const names = listDir(dirAbs)
  const entries = names.map((n) => toEntry(def.id, dirAbs, n, def.content))
  if (def.id === 'shared-agents') entries.push(...pluginAgentEntries())
  if (entries.length === 0) return def.expected ? emptyShell(def.id, def.label, def.icon, dirAbs, def.blurb) : null
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return { id: def.id, label: def.label, icon: def.icon, path: dirAbs, blurb: def.blurb, entries }
}

// B11: leere Soll-Kategorie sichtbar als „leer" — nur wenn der Parent
// (.shared/.claude) existiert; Fremd-Setup bleibt unsichtbar (B13-Bezug).
function emptyShell(id: string, label: string, icon: string, p: string, blurb: string): Category | null {
  if (!existsSync(sharedDir())) return null
  return { id, label, icon, path: p, blurb: `${blurb} – Ordner ist leer`, entries: [] }
}

// Kanonische Anthropic-/Codex-Instruction-Dateien im .shared/.claude/-Root.
// Whitelist: nur CLAUDE.md, CLAUDE.local.md, AGENTS.md.
// Overview.md/INDEX.md/ROUTER.md sind normale Docs und werden hier nicht aufgefuehrt.
const INSTRUCTION_WHITELIST = new Set(['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'])

function buildInstructions(): Category | null {
  const entries: ConfigEntry[] = []
  for (const d of listDirents(sharedDir())) {
    if (!d.isFile()) continue
    if (!INSTRUCTION_WHITELIST.has(d.name)) continue
    if (isSecretHint(path.join(sharedDir(), d.name))) continue
    entries.push(toEntry('shared-instr', sharedDir(), d.name, true))
  }
  // B11: Instructions sind Soll-Kategorie — gleiche Leer-Regel wie die A-Trunks.
  if (entries.length === 0) return emptyShell('shared-instructions', 'Instructions', 'list', sharedDir(), 'Kanonische Instruction-Dateien (CLAUDE.md / AGENTS.md)')
  return {
    id: 'shared-instructions',
    label: 'Instructions',
    icon: 'list',
    path: sharedDir(),
    blurb: 'Kanonische Instruction-Dateien (CLAUDE.md / AGENTS.md)',
    entries
  }
}

// Scope-Filter C: references/** als Eintraege mit Inhalts-Vorschau (read-only).
// W1-Fix: Unterordner-Eintraege drillen jetzt in ihre Definitionsdatei.
function buildReferences(): Category | null {
  const dirAbs = path.join(sharedDir(), 'references')
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
  const dirAbs = path.join(sharedDir(), 'coordination', 'registry')
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
  const coordAbs = path.join(sharedDir(), 'coordination')
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
  if (!sharedDir()) return { categories: [], duplicates: [], diffLabels: SHARED_DIFF_LABELS }
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
