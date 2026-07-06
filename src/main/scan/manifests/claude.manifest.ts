// claude.manifest.ts — datengetriebenes Manifest fuer ~/.claude (B-4).
// Alle 8 Bestands-Kategorien sind CustomCategory: scanClaude bildet die
// ConfigEntry.id NICHT slugifiziert (`skill-${name}`/`rule-${nm}`/`agent-${nm}`),
// nutzt bespoke Sammler (collectSkills/Settings/Hooks/Plugins …) und maskierte
// struct-Previews fuer secret-classed Einzeldateien. Die generische Engine
// (runFileCategory slugifiziert ids) reproduziert das NICHT 1:1 -> Fidelity vor
// Eleganz: jede Kategorie wrappt die bewaehrte Bestands-Funktion und liefert die
// FERTIGE Category. Die collectX() lesen aus dem modul-gebundenen claudeDir
// (configRoots().claudeHome); resolveRoots(manifest.roots) loest dieselbe Wurzel
// auf -> base === claudeDir (sandbox-aware identisch). Reihenfolge = scanClaude.
import path from 'node:path'
import type { Category } from '@shared/contract'
import type { ProviderManifest } from '@shared/contract-provider'
import { diffLabels } from '@shared/dup-labels'
import {
  claudeCat,
  claudeDir,
  collectSkills,
  collectRules,
  collectAgents,
  collectHooks,
  collectInstructions,
  collectSettings,
  collectTeams,
  collectPlugins,
} from '../claude-scan'

// Eine Custom-Kategorie deklarieren: feste id/label/icon/blurb + Sammler.
// Der Sammler liefert die Eintraege; der Pfad zeigt auf den Bestands-Ort relativ
// zur aufgeloesten Provider-Basis (base === claudeDir). Funktion < 50 Z.
function customCat(
  id: string,
  label: string,
  icon: string,
  rel: string,
  blurb: string,
  collect: () => Category['entries'],
): { custom: (base: string) => Category } {
  return { custom: (base) => claudeCat(id, label, icon, path.join(base, rel), blurb, collect()) }
}

export const claudeManifest: ProviderManifest = {
  id: 'claude',
  label: 'Claude',
  roots: [{ rootKey: 'claudeHome' }],
  capabilities: ['secret-guarded'],
  // Bestands-DiffLabels: scanClaude setzt diffLabels('claude') (CLAUDE_DIFF_LABELS).
  diffLabels: diffLabels('claude'),
  categories: [
    customCat('skills', 'Skills', 'skill', 'skills', 'Globale Skill-Definitionen', collectSkills),
    customCat('rules', 'Rules', 'rule', 'rules', 'Verhaltensregeln (always-on/conditional)', collectRules),
    customCat('agents', 'Agents', 'agent', 'agents', 'Globale Agent-Definitionen', collectAgents),
    customCat('hooks', 'Hooks', 'hook', 'settings.json', 'Hook-Events aus settings.json', collectHooks),
    customCat('instructions', 'Instructions', 'list', '', 'CLAUDE.md + lokale Settings', collectInstructions),
    customCat('settings', 'Settings', 'gear', 'settings.json', 'settings.json Struktur (Werte redacted)', collectSettings),
    customCat('teams', 'Teams', 'team', 'teams', 'Team-Konfigurationen (config.json)', collectTeams),
    customCat('plugins', 'Plugins', 'plug', 'plugins', 'Installierte Plugins (installed_plugins.json)', collectPlugins),
  ],
}

// Genutzt im Equivalence-Test als Lesbarkeits-Anker (Bestands-claudeDir).
export const claudeManifestRoot = claudeDir
