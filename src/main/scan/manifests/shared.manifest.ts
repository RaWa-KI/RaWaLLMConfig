// shared.manifest.ts — datengetriebenes Manifest fuer .shared/.claude (B-4).
// ALLE Kategorien sind CustomCategory: scanShared bildet die ConfigEntry.id
// NICHT slugifiziert (`${catId}-${name}`), sortiert die A-Karten
// (localeCompare), haengt pluginAgentEntries an die agents-Karte, nutzt
// Zaehler-only Coordination-Eintraege und eine Whitelist-Instructions-Logik —
// die generische Engine reproduziert das NICHT 1:1. Jede Kategorie wrappt die
// bewaehrte Bestands-Funktion (buildACategory/buildInstructions/buildReferences/
// buildRegistry/buildCoordinationCounters) und liefert die FERTIGE Category.
// Die Builder binden sharedDir modulintern (configRoots().sharedClaude); im
// Equivalence-Test ist base === sharedDir (sandbox-aware identisch).
// Reihenfolge = scanShared: A_CATEGORIES (agents, rules, skills, hooks, plugins,
// tools), dann instructions, references, registry, coordination.
//
// Voraussetzung fuer Migrations-Gleichheit: jede Kategorie hat mind. 1 Eintrag
// (sonst liefert der Bestands-Scanner null und LAESST DIE KATEGORIE AUS; der
// Equivalence-Test seedet daher jede Kategorie). Liefert ein Builder dennoch
// null, baut die Custom-Closure eine treue leere Huelle (gleiche Metadaten).
import path from 'node:path'
import type { Category } from '@shared/contract'
import type { CustomCategory, ProviderManifest } from '@shared/contract-provider'
import { diffLabels } from '@shared/dup-labels'
import {
  sharedDir,
  A_CATEGORIES,
  buildACategory,
  buildInstructions,
  buildReferences,
  buildRegistry,
  buildCoordinationCounters,
} from '../shared-scan'

// Eine A-Karte als CustomCategory: buildACategory liefert die fertige (sortierte,
// plugin-agent-angereicherte) Category. Null-Fall (leerer Ordner) -> treue leere
// Huelle mit denselben Metadaten (im Test nie getroffen). Funktion < 50 Z.
function aCustom(def: (typeof A_CATEGORIES)[number]): CustomCategory {
  return {
    custom: () =>
      buildACategory(def) ?? {
        id: def.id,
        label: def.label,
        icon: def.icon,
        path: path.join(sharedDir, def.dir),
        blurb: def.blurb,
        entries: [],
      },
  }
}

// Eine nullable build*()-Funktion als CustomCategory wrappen. Liefert der Builder
// null (leerer Ordner), gibt die Closure eine leere Huelle mit fester Metadaten-
// Identitaet zurueck (im Test nie getroffen). Funktion < 50 Z.
function buildCustom(
  build: () => Category | null,
  shell: () => Category,
): CustomCategory {
  return { custom: () => build() ?? shell() }
}

// Leere Huellen-Fabrik (Metadaten exakt wie der Bestands-Builder im Nicht-Null-Fall).
function shell(id: string, label: string, icon: string, rel: string, blurb: string): () => Category {
  return () => ({ id, label, icon, path: path.join(sharedDir, rel), blurb, entries: [] })
}

export const sharedManifest: ProviderManifest = {
  id: 'shared',
  label: 'Shared',
  roots: [{ rootKey: 'sharedClaude' }],
  capabilities: ['secret-guarded'],
  // Bestands-DiffLabels: scanShared setzt diffLabels('workspace') (SHARED_DIFF_LABELS).
  diffLabels: diffLabels('workspace'),
  categories: [
    ...A_CATEGORIES.map(aCustom),
    buildCustom(buildInstructions, shell('shared-instructions', 'Instructions', 'list', '', 'Kanonische Instruction-Dateien (CLAUDE.md / AGENTS.md)')),
    buildCustom(buildReferences, shell('shared-references', 'References', 'list', 'references', 'Read-only Referenz-/Kontext-Dokumente')),
    buildCustom(buildRegistry, shell('shared-registry', 'Registry', 'list', path.join('coordination', 'registry'), 'Workspace-/Port-/Dependency-Registry')),
    buildCustom(buildCoordinationCounters, shell('shared-coordination', 'Coordination', 'list', 'coordination', 'Inventar-Zaehler (ausserhalb Config-Scope)')),
  ],
}

// Lesbarkeits-Anker fuer den Equivalence-Test (Bestands-sharedDir).
export const sharedManifestRoot = sharedDir
