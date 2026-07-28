// scan-userglobal.ts — Aufbau der abgeleiteten Familie `userglobal` (read-only).
// HR27-Split aus scan-index.ts (die Datei lag bei 293/300 Zeilen und musste fuer
// die Kimi-Familie erweitert werden). Die Logik ist UNVERAENDERT uebernommen und
// nur um die dritte Userglobal-Quelle `kimi` (~/.kimi-code) ergaenzt (HR16:
// Claude, Codex und Kimi sind gleichwertige native Loader).
//
// userglobal ist keine eigene Scan-Quelle, sondern eine Sicht: die bereits
// gescannten Familien-Kategorien werden auf ihren Userglobal-Root gefiltert und
// mit Werkzeug-/Ebene-Feldern geklont. Zusaetzlich die Kimi-Skills aus ~/.agents
// (eigener Loader-Pfad, keine eigene Familie).
import path from 'node:path'
import fs from 'node:fs'
import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import { isPathEqualOrUnder } from '@shared/path-compare'
import { configRoots } from '../services/config-roots'
import { kimiHome } from './manifests/kimi-cats'

function isUnderRoot(rawPath: string, rawRoot: string): boolean {
  if (!rawPath || !rawRoot) return false
  return isPathEqualOrUnder(path.resolve(rawPath), path.resolve(rawRoot), process.platform)
}

function cloneUserEntry(entry: ConfigEntry, source: string, sourceLabel: string): ConfigEntry {
  return {
    ...entry,
    id: `userglobal-${source}-${entry.id}`,
    scope: 'global',
    origin: `${sourceLabel} · Userglobal`,
    fields: { ...(entry.fields ?? {}), Werkzeug: sourceLabel, Ebene: 'Userglobal' }
  }
}

function cloneUserCategory(cat: Category, source: string, sourceLabel: string, root: string): Category | null {
  const entries = cat.entries
    .filter((entry) => isUnderRoot(entry.path, root))
    .map((entry) => cloneUserEntry(entry, source, sourceLabel))
  if (entries.length === 0) return null
  const baseId = cat.id.replace(/^(codex|shared|kimi)-/, '')
  return {
    ...cat,
    id: `userglobal-${source}-${baseId}`,
    label: `${sourceLabel} · ${cat.label}`,
    path: isUnderRoot(cat.path, root) ? cat.path : root,
    blurb: `Userglobale ${sourceLabel}-Dateien: ${cat.blurb}`,
    entries
  }
}

// WP2 Drift-Relation: dritter Userglobal-Root ~/.agents (Kimi-Loader, HR16-
// Paritaet). Keine eigene agents-Familie im Scan — Skills direkt gelesen
// (read-only); fehlender Root -> null. Root aus claudeHome-Parent abgeleitet
// (Default: Home; Sandbox: <sandbox>).
function scanAgentsSkills(agentsRoot: string): Category | null {
  const skillsDir = path.join(agentsRoot, 'skills')
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(skillsDir, { withFileTypes: true })
  } catch { return null }
  const entries: ConfigEntry[] = []
  for (const d of dirents) {
    if (!d.isDirectory()) continue
    const skillMd = path.join(skillsDir, d.name, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue
    entries.push({
      id: `userglobal-agents-skill-${d.name}`, name: d.name, status: 'active',
      scope: 'global', path: skillMd, desc: 'Kimi-Skill (~/.agents)', updated: '',
      origin: 'Kimi · Userglobal',
      fields: { Werkzeug: 'Kimi', Ebene: 'Userglobal' }
    })
  }
  if (entries.length === 0) return null
  return {
    id: 'userglobal-agents-skills', label: 'Kimi · Skills', icon: 'skill',
    path: skillsDir, blurb: 'Userglobale Kimi-Dateien: Skills aus ~/.agents', entries
  }
}

/**
 * Die abgeleitete Familie `userglobal` bauen: Claude-, Codex- und Kimi-
 * Kategorien auf ihren jeweiligen Userglobal-Root gefiltert, danach die
 * Kimi-Skills aus ~/.agents. Reihenfolge stabil (Quelle nach Quelle).
 */
export function buildUserglobal(data: Record<string, LlmConfig>): LlmConfig {
  const roots = configRoots()
  const sources = [
    { key: 'claude', label: 'Claude', root: roots.claudeHome },
    { key: 'codex', label: 'Codex', root: roots.codexHome },
    { key: 'kimi', label: 'Kimi', root: kimiHome() }
  ]
  const categories: Category[] = []
  for (const source of sources) {
    for (const cat of data[source.key]?.categories ?? []) {
      const userCat = cloneUserCategory(cat, source.key, source.label, source.root)
      if (userCat) categories.push(userCat)
    }
  }
  const agentsCat = scanAgentsSkills(path.join(path.dirname(roots.claudeHome), '.agents'))
  if (agentsCat) categories.push(agentsCat)
  return { categories, duplicates: [], driftRelations: [] }
}
