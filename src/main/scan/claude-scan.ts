// Scanner fuer ~/.claude — read-only. Baut LlmConfig-Kategorien aus realen
// Inhalten. NIE Secret-Werte lesen (credentials/**, .credentials.json,
// security/**, *.env/*.key/*.pem, settings*.json, .claude.json). Nur fuer
// unkritische Text-/Markdown-Configs (Skills/Rules/Agents/CLAUDE.md) wird der
// echte Inhalt als Vorschau (code) gesurft. settings/api/hooks: nur Namen.
import fs from 'node:fs'
import path from 'node:path'
import type { LlmConfig, Category, ConfigEntry } from '@shared/contract'
import { diffLabels } from '@shared/dup-labels'
import { isSecretPathForRead } from '../services/secret-guard'
import { configRoots } from '../services/config-roots'
import { collectClaudeMds } from './claude-scan-instructions'
import {
  mtimeSafe,
  buildPreview,
  firstContentLine,
  parseFrontmatter,
  parseFrontmatterKeys,
  drillTeamEntry,
  drillPluginEntry,
} from './scan-helpers'
import { frontmatterFields, ruleFrontmatterState } from './frontmatter-meta'
import { readFileOnce } from './file-read-once'
import { collectClaudeInstalledPlugins, maskedPreview } from './scan-claude-plugins'
import { invalidConfigEntry } from './scan-invalid-entry'
import { extractSearchKeys } from './content-index'
import { configEntry as entry } from './scan-entry'

// Basis-Pfad aus der Single Source (Default = realer ~/.claude, M1 unveraendert;
// mit RAWALLM_SANDBOX_ROOT = <sandbox>/.claude). Bei Modul-Load aufgeloest.
const claudeDir = configRoots().claudeHome

// Sichtbare Spalten-Anker (Quelle->Ziel->Wirkung) zentral aus dup-labels:
// zentrale Version (Shared) gegenueber der lokalen Claude-Kopie.
const CLAUDE_DIFF_LABELS = diffLabels('claude')

// Verzeichniseintraege sicher lesen (mit Dirent-Typ).
function readDirSafe(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    console.error('[scan:claude]', `readdir ${path.basename(dir)}: ${(err as NodeJS.ErrnoException).code ?? 'fail'}`)
    return []
  }
}

// Skills: je Unterordner mit SKILL.md ein Entry inkl. Inhaltsvorschau.
// WP16: GENAU 1 readFileOnce je SKILL.md (statt existsSync + 3 Voll-Reads + stats).
function collectSkills(): ConfigEntry[] {
  const base = path.join(claudeDir, 'skills')
  const out: ConfigEntry[] = []
  for (const d of readDirSafe(base)) {
    if (!d.isDirectory()) continue
    const skillMd = path.join(base, d.name, 'SKILL.md')
    const snap = readFileOnce(skillMd)
    if (!snap) continue
    const text = snap.text
    const fm = text ? parseFrontmatter(text) : {}
    const desc = fm.description || (text ? firstContentLine(text) : '') || 'Skill-Definition'
    const fields: Record<string, string> = { typ: 'SKILL.md', ...frontmatterFields(fm, text ? parseFrontmatterKeys(text) : [], 'claude-skill') }
    if (text) fields.zeilen = String(text.split('\n').length)
    if (snap.sizeKb) fields.groesse = snap.sizeKb
    out.push(entry(`skill-${d.name}`, d.name, skillMd, desc, fields,
      text !== undefined ? buildPreview(text, 45, 1800) : undefined, snap, 'claude-skill'))
  }
  return out
}

// Agents: Markdown mit Frontmatter (description/model/tools) + Vorschau.
// WP16: GENAU 1 readFileOnce je Agent-Datei.
function collectAgents(): ConfigEntry[] {
  const base = path.join(claudeDir, 'agents')
  const out: ConfigEntry[] = []
  for (const d of readDirSafe(base)) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue
    const fp = path.join(base, d.name)
    const nm = d.name.replace(/\.md$/, '')
    const snap = readFileOnce(fp)
    const text = snap?.text
    const fm = text ? parseFrontmatter(text) : {}
    const desc = fm.description || (text ? firstContentLine(text) : '') || 'Agent-Definition'
    const fields: Record<string, string> = { ...frontmatterFields(fm, text ? parseFrontmatterKeys(text) : [], 'claude-agent') }
    if (text) fields.zeilen = String(text.split('\n').length)
    if (snap?.sizeKb) fields.groesse = snap.sizeKb
    out.push(entry(`agent-${nm}`, nm, fp, desc, fields,
      text !== undefined ? buildPreview(text, 45, 1800) : undefined, snap, 'claude-agent'))
  }
  return out
}

// Rules: Markdown — erste H1-Ueberschrift als desc, Zeilen + Vorschau.
// WP16: GENAU 1 readFileOnce je Rule-Datei.
function collectRules(): ConfigEntry[] {
  const base = path.join(claudeDir, 'rules')
  const out: ConfigEntry[] = []
  for (const d of readDirSafe(base)) {
    if (!d.isFile() || !d.name.endsWith('.md')) continue
    const fp = path.join(base, d.name)
    const nm = d.name.replace(/\.md$/, '')
    const snap = readFileOnce(fp)
    const text = snap?.text
    const h1 = text ? (/^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '') : ''
    const desc = h1 || (text ? firstContentLine(text) : '') || 'Rule-Definition'
    const fm = text ? parseFrontmatter(text) : {}
    const fields: Record<string, string> = { ...frontmatterFields(fm, text ? parseFrontmatterKeys(text) : [], 'claude-rule') }
    if (text) fields.zeilen = String(text.split('\n').length)
    if (snap?.sizeKb) fields.groesse = snap.sizeKb
    const e = entry(`rule-${nm}`, nm, fp, desc, fields,
      text !== undefined ? buildPreview(text, 45, 1800) : undefined, snap, 'claude-rule')
    const state = ruleFrontmatterState(fm)
    if (state.status) e.status = state.status
    if (state.conflictReason) e.conflictReason = state.conflictReason
    out.push(e)
  }
  return out
}

// Hook-Event-Eintraege aus settings.json (Owner-Override #2: settings-Events
// bekommen jetzt eine MASKIERTE struct-preview, damit der Drawer Struktur zeigt).
// WP16: BEWUSST NICHT auf readFileOnce migriert — settings.json ist eine
// secret-classed Einzeldatei (bounded, kein N-Dateien-Hotpath); ebenso
// collectSettings und scan-claude-plugins.ts (1 Inventardatei). Kein Scope-Kriechen (HR4).
function collectHookEvents(fp: string): ConfigEntry[] {
  const out: ConfigEntry[] = []
  try {
    const s = JSON.parse(fs.readFileSync(fp, 'utf8')) as { hooks?: Record<string, unknown[]> }
    const updated = mtimeSafe(fp)
    // Maskierte Vorschau der GESAMTEN settings.json (Werte -> •••, Struktur sichtbar).
    const preview = maskedPreview(fp)
    // searchKeys aus settings.json (Keys/Struktur, nie Werte) — einmal je Event.
    const searchKeys = extractSearchKeys(fp)
    for (const ev of Object.keys(s.hooks ?? {})) {
      const arr = s.hooks?.[ev]
      let count = 0
      if (Array.isArray(arr)) {
        for (const m of arr) {
          const hs = (m as { hooks?: unknown[] }).hooks
          if (Array.isArray(hs)) count += hs.length
        }
      }
      out.push({
        id: `hook-${ev}`, name: ev, status: 'active', scope: 'global', path: fp,
        desc: 'Hook-Event (settings.json)', updated, fields: { hooks: String(count) },
        code: preview || undefined,
        ...(searchKeys.length ? { searchKeys } : {}),
      })
    }
  } catch (err) {
    console.error('[scan:claude]', `hooks: ${(err as Error).message.slice(0, 40)}`)
    out.push(invalidConfigEntry('hook-settings-json', 'settings.json', fp, err)) // Variante A: sichtbarer Befund statt stillem Weglassen
  }
  return out
}

// Hook-Skripte aus ~/.claude/hooks/*.cjs|*.sh|*.ps1|*.js (Owner-Override #2).
// Skripte sind KEINE Secret-Klasse -> Roh-Inhalt als Vorschau ist erlaubt.
// WP16: GENAU 1 readFileOnce je Skript.
function collectHookScripts(): ConfigEntry[] {
  const base = path.join(claudeDir, 'hooks')
  const out: ConfigEntry[] = []
  for (const d of readDirSafe(base)) {
    if (!d.isFile() || !/\.(cjs|mjs|js|sh|ps1)$/i.test(d.name)) continue
    const fp = path.join(base, d.name)
    const snap = readFileOnce(fp)
    const fields: Record<string, string> = { typ: path.extname(d.name).slice(1) }
    if (snap?.sizeKb) fields.groesse = snap.sizeKb
    const text = snap?.text
    if (text) fields.zeilen = String(text.split('\n').length)
    out.push(entry(`hookscript-${d.name}`, d.name, fp, 'Hook-Skript', fields,
      text !== undefined ? buildPreview(text, 45, 1800) : undefined, snap))
  }
  return out
}

// Hooks: settings.json-Events (maskierte struct-preview) + ~/.claude/hooks/-Skripte.
function collectHooks(): ConfigEntry[] {
  return [...collectHookEvents(path.join(claudeDir, 'settings.json')), ...collectHookScripts()]
}

// Settings: nur Top-Level-Key-Namen + Strukturzaehler, Werte redacted.
function collectSettings(): ConfigEntry[] {
  const fp = path.join(claudeDir, 'settings.json')
  try {
    const s = JSON.parse(fs.readFileSync(fp, 'utf8')) as Record<string, unknown>
    const perm = s.permissions as { deny?: unknown[]; allow?: unknown[] } | undefined
    const fields: Record<string, string> = {
      keys: String(Object.keys(s).length),
      'permissions.deny': String(Array.isArray(perm?.deny) ? perm!.deny!.length : 0),
      'permissions.allow': String(Array.isArray(perm?.allow) ? perm!.allow!.length : 0),
      'env-keys': String(s.env ? Object.keys(s.env as object).length : 0),
    }
    // Owner-Override #11: maskierte struct-preview (Werte -> •••) als entry.code.
    return [entry('settings-json', 'settings.json', fp, 'Top-Level-Keys (Werte maskiert)', fields, maskedPreview(fp) || undefined)]
  } catch (err) {
    console.error('[scan:claude]', `settings: ${(err as Error).message.slice(0, 40)}`)
    return [invalidConfigEntry('settings-json', 'settings.json', fp, err)] // Variante A: sichtbarer Befund statt leerer Kategorie
  }
}

// Instructions: alle CLAUDE.md (global + je WS) + settings.local.json-Existenz.
function collectInstructions(): ConfigEntry[] {
  const out: ConfigEntry[] = collectClaudeMds(claudeDir)
  // settings.local.json + .claude.json: secret-classed -> MASKIERTE struct-preview
  // (Owner-Override #11). Eintraege mit path, damit readFull (maskiert) sie zeigt.
  const local = path.join(claudeDir, 'settings.local.json')
  if (fs.existsSync(local)) {
    out.push(entry('instr-settings-local', 'settings.local.json', local,
      'Lokale Settings (Werte maskiert)', { typ: 'settings.local.json' }, maskedPreview(local) || undefined))
  }
  const claudeJson = path.join(claudeDir, '.claude.json')
  if (fs.existsSync(claudeJson)) {
    out.push(entry('instr-claude-json', '.claude.json', claudeJson,
      'Instructions/Plugins-Quellen (Werte maskiert)', { typ: '.claude.json' }, maskedPreview(claudeJson) || undefined))
  }
  return out
}

// Teams: je Unterordner Drilldown auf config.json (entry.code + Datei-Pfad).
// Kein Fallback auf Ordner-Pfad — nur Teams mit config.json werden gelistet.
function collectTeams(): ConfigEntry[] {
  const base = path.join(claudeDir, 'teams')
  const out: ConfigEntry[] = []
  for (const d of readDirSafe(base)) {
    if (!d.isDirectory()) continue
    const drilled = drillTeamEntry('team', base, d.name)
    if (drilled) {
      out.push(drilled)
    } else {
      // Ordner ohne config.json: nur mit Metadaten listen (kein readFull moeglich)
      out.push(entry(`team-${d.name}`, d.name, path.join(base, d.name),
        'Team-Konfiguration (keine config.json)', { typ: 'dir' }))
    }
  }
  return out
}

// Plugins: Drilldown auf installed_plugins.json (oder package.json) je Unterordner.
// Listet keine reinen Infra-Verzeichnisse (cache/data/marketplaces) als Eintraege.
function collectPlugins(): ConfigEntry[] {
  const base = path.join(claudeDir, 'plugins')
  // Infra-Verzeichnisse: nur als Metadaten, kein Drilldown
  const INFRA_DIRS = new Set(['cache', 'data', 'marketplaces', 'logs', 'tmp'])
  // Owner-Override #1: Top-Level installed_plugins.json wird zuerst gelistet
  // (collectPlugins iterierte bisher NUR Verzeichnisse -> ~15-37 installierte
  // Plugins waren unsichtbar). Doppel-Eintraege per Plugin-Name deduplizieren.
  const out: ConfigEntry[] = collectClaudeInstalledPlugins('plugin', base)
  const seen = new Set(out.map((e) => e.name.toLowerCase()))
  for (const d of readDirSafe(base)) {
    if (!d.isDirectory()) continue
    if (INFRA_DIRS.has(d.name.toLowerCase())) continue
    if (seen.has(d.name.toLowerCase())) continue
    const drilled = drillPluginEntry('plugin', base, d.name)
    if (drilled) {
      out.push(drilled)
    } else {
      out.push(entry(`plugin-${d.name}`, d.name, path.join(base, d.name),
        'Plugin-Verzeichnis (keine Definitionsdatei)', { typ: 'dir' }))
    }
  }
  return out
}

// Kategorie-Huelle mit fester Reihenfolge erzeugen.
function cat(id: string, label: string, icon: string, p: string, blurb: string, entries: ConfigEntry[]): Category {
  return { id, label, icon, path: p, blurb, entries }
}

// B-4: additive Exporte fuer die datengetriebenen Manifest-CustomCategories.
// NUR Sichtbarmachung der bewaehrten Bestands-Funktionen — Logik UNVERAENDERT.
// Die Engine-Manifeste wrappen diese, damit die Migrations-Gleichheit gilt.
export { cat as claudeCat, claudeDir, collectSkills, collectRules, collectAgents }
export { collectHooks, collectInstructions, collectSettings, collectTeams, collectPlugins }

export function scanClaude(): LlmConfig {
  const categories: Category[] = [
    cat('skills', 'Skills', 'skill', path.join(claudeDir, 'skills'), 'Globale Skill-Definitionen', collectSkills()),
    cat('rules', 'Rules', 'rule', path.join(claudeDir, 'rules'), 'Verhaltensregeln (always-on/conditional)', collectRules()),
    cat('agents', 'Agents', 'agent', path.join(claudeDir, 'agents'), 'Globale Agent-Definitionen', collectAgents()),
    cat('hooks', 'Hooks', 'hook', path.join(claudeDir, 'settings.json'), 'Hook-Events aus settings.json', collectHooks()),
    cat('instructions', 'Instructions', 'list', claudeDir, 'CLAUDE.md + lokale Settings', collectInstructions()),
    cat('settings', 'Settings', 'gear', path.join(claudeDir, 'settings.json'), 'settings.json Struktur (Werte redacted)', collectSettings()),
    cat('teams', 'Teams', 'team', path.join(claudeDir, 'teams'), 'Team-Konfigurationen (config.json)', collectTeams()),
    cat('plugins', 'Plugins', 'plug', path.join(claudeDir, 'plugins'), 'Installierte Plugins (installed_plugins.json)', collectPlugins()),
  ]
  return { categories, duplicates: [], diffLabels: CLAUDE_DIFF_LABELS }
}
