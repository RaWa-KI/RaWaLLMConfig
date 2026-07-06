// codex-scan.ts — read-only Scanner fuer ~/.codex (Codex CLI Config).
// Liest zur Laufzeit Verzeichnis-/Dateistruktur. NIE Secret-Werte:
// auth.json / .sandbox-secrets / .codex-global-state* / *.env / *.key / *.pem
// werden nie gelesen, config.toml nur Key-Namen/Sektionen (Werte redacted).
import fs from 'node:fs'
import path from 'node:path'
import type { Category, ConfigEntry, LlmConfig } from '@shared/contract'
import { diffLabels } from '@shared/dup-labels'
import { configRoots, workspaceRoots } from '../services/config-roots'
import {
  isSecret,
  mtime,
  listDir,
  fileEntry,
  dirEntry,
} from './codex-scan-helpers'
import { parseFrontmatter, parseFrontmatterKeys, buildPreview, descFromPreview } from './scan-helpers'
import { readFileOnce } from './file-read-once'
import { maskedPreview } from './scan-claude-plugins'
import { invalidConfigEntry } from './scan-invalid-entry'
import { extractSearchKeys, extractSearchKeysFromText } from './content-index'
import { decorateConfigEntry } from './load-classifier'
import { inferFrontmatterArtifact } from './frontmatter-schema'
import { frontmatterFields } from './frontmatter-meta'

// Basis-Pfad aus der Single Source (Default = realer ~/.codex, M1 unveraendert;
// mit RAWALLM_SANDBOX_ROOT = <sandbox>/.codex). Bei Modul-Load aufgeloest.
const codexDir = configRoots().codexHome

// Sichtbare Spalten-Anker (Quelle->Ziel->Wirkung) zentral aus dup-labels:
// zentrale Version (Shared) gegenueber der lokalen Codex-Kopie.
const CODEX_DIFF_LABELS = diffLabels('codex')

function cat(id: string, label: string, icon: string, p: string, blurb: string, entries: ConfigEntry[]): Category {
  return { id, label, icon, path: p, blurb, entries }
}

// Eine WS-AGENTS.md als Instructions-Entry bauen (falls existiert). scope/origin
// machen den Ursprung im Vergleich sichtbar. dedupe verhindert Doppel-Pfade.
function pushAgentsMd(entries: ConfigEntry[], seen: Set<string>, dir: string, label: string): void {
  const fp = path.join(dir, 'AGENTS.md')
  const key = fp.toLowerCase()
  if (seen.has(key) || !fs.existsSync(fp)) return
  seen.add(key)
  const e = fileEntry(`codex-agents-md-${label}`, dir, 'AGENTS.md', 'project', `AGENTS.md (${label})`, true)
  e.origin = label
  e.fields = { ...e.fields, ursprung: label }
  entries.push(e)
}

// instructions: ~/.codex Root-Startanker (AGENTS.md/Paritaet/Profile) PLUS
// F6: AGENTS.md ueber ALLE Workspaces (<ws>/AGENTS.md + <ws>/.claude/AGENTS.md).
// W8-Fix: pm-light/full.config.toml (echte Codex-Configs) werden mit erfasst.
function scanInstructions(): Category {
  const entries: ConfigEntry[] = []
  const seen = new Set<string>()
  for (const d of listDir(codexDir)) {
    if (!d.isFile()) continue
    const isMd = /\.md$/i.test(d.name) && /^(AGENTS|CLAUDE_PARITY|CODEX)/i.test(d.name)
    const isToml = /\.toml$/i.test(d.name) && /^(pm-|profile)/i.test(d.name)
    if (!isMd && !isToml) continue
    if (/^AGENTS\.md$/i.test(d.name)) seen.add(path.join(codexDir, d.name).toLowerCase())
    entries.push(fileEntry('codex-instr', codexDir, d.name, 'global', 'Startanker/Paritaets-Doku', true))
  }
  for (const w of workspaceRoots()) {
    pushAgentsMd(entries, seen, w.root, `${w.label} (Root)`)
    pushAgentsMd(entries, seen, path.join(w.root, '.claude'), `${w.label} (.claude)`)
  }
  return cat('codex-instructions', 'Instructions', 'list', codexDir, 'Startanker AGENTS.md (global + alle WS), Paritaet, Profile', entries)
}

// config.toml: Sektionen + Top-Level-Keys, Werte komplett redacted.
// W8-Fix: kein hardcodierter Fake-Stub-code — stattdessen strukturelle Vorschau
// mit echten Sektions-/Key-Namen (aber allen Werten ersetzt durch "…").
function scanSettings(): Category {
  const entries: ConfigEntry[] = []
  const tomlPath = path.join(codexDir, 'config.toml')
  try {
    const txt = fs.readFileSync(tomlPath, 'utf8')
    const lines = txt.split('\n')
    const sections: string[] = []
    const topKeys: string[] = []
    const previewLines: string[] = []
    for (const raw of lines) {
      const line = raw.trim()
      const sec = line.match(/^\[([^\]]+)\]/)
      if (sec) {
        if (!sec[1].startsWith('projects') && sections.length < 12) sections.push(sec[1])
        if (previewLines.length < 40) previewLines.push(raw)
        continue
      }
      const kv = raw.match(/^([a-zA-Z_]+)\s*=/)
      if (kv) {
        const key = kv[1]
        if (topKeys.length < 12 && !/auth|token|key|secret|password/i.test(key)) topKeys.push(key)
        // Strukturvorschau: Key = "…" (Wert nie ausgeben)
        if (previewLines.length < 40 && !/auth|token|key|secret|password/i.test(key)) {
          previewLines.push(`${key} = "…"`)
        }
      }
    }
    const structPreview = previewLines.join('\n') || 'model = "…"\napproval_policy = "…"\nsandbox_mode = "…"'
    entries.push({
      id: 'codex-config-toml',
      name: 'config.toml',
      status: 'active',
      scope: 'global',
      path: tomlPath,
      desc: 'Codex-Hauptconfig (nur Struktur)',
      updated: mtime(tomlPath),
      fields: {
        Sektionen: sections.slice(0, 8).join(', ') || '-',
        Keys: topKeys.slice(0, 8).join(', ') || '-',
        Hinweis: 'Werte redacted, keine auth',
      },
      // Strukturvorschau (echte Schluessel, alle Werte als "…" — kein Fake-Stub)
      code: structPreview,
      // searchKeys aus config.toml (TOML-Keys/Sektionen, nie Werte; config.toml
      // ist Secret-Klasse -> content-index maskiert vor der Extraktion).
      searchKeys: extractSearchKeys(tomlPath),
    })
  } catch (e) {
    console.error('[scan:codex]', 'config.toml', (e as Error).message.slice(0, 80))
    entries.push(invalidConfigEntry('codex-config-toml', 'config.toml', tomlPath, e, 'TOML-Lesefehler')) // Variante A
  }
  return cat('codex-settings', 'Settings', 'gear', tomlPath, 'config.toml — Sektionen/Keys (Werte redacted)', entries)
}

// hooks: hooks.json (Events/Namen, MASKIERTE struct-preview) + hooks/* Dateien
// + Rekursion in Hook-Subdirs (claude-mirror/claude-user). Owner-Override #2:
// Skripte tragen jetzt Inhalt (.cjs/.sh roh ok), hooks.json wird maskiert.
function scanHooks(): Category {
  const entries: ConfigEntry[] = []
  const hooksJson = path.join(codexDir, 'hooks.json')
  try {
    // WP17: hooks.json GENAU EINMAL lesen — JSON.parse, maskedPreview (raw)
    // und searchKeys teilen sich denselben Text (vorher 3 Reads + 1 stat).
    const rawTxt = fs.readFileSync(hooksJson, 'utf8')
    const j = JSON.parse(rawTxt) as { hooks?: Record<string, { hooks?: unknown[] }[]> }
    const ev = j.hooks || {}
    const evNames = Object.keys(ev)
    let total = 0
    for (const name of evNames) for (const g of ev[name]) total += (g.hooks || []).length
    entries.push({
      id: 'codex-hooks-json',
      name: 'hooks.json',
      status: 'active',
      scope: 'global',
      path: hooksJson,
      desc: 'Hook-Registrierung (Events, Werte maskiert)',
      updated: mtime(hooksJson),
      fields: { Events: evNames.join(', ') || '-', Befehle: String(total) },
      // Owner-Override #11: maskierte struct-preview (Befehls-Pfade sichtbar,
      // potenzielle Token -> •••). hooks.json ist nicht in der Secret-Klasse;
      // rawTxt als raw-Param: maskSecrets laeuft unveraendert (WP16-Regel).
      code: maskedPreview(hooksJson, 45, 1800, rawTxt) || undefined,
      // searchKeys aus hooks.json (JSON-Keys rekursiv, nie Werte) — aus dem
      // bereits gelesenen Text (Inhalt liegt vor, kein Zweit-Read).
      searchKeys: extractSearchKeysFromText(hooksJson, rawTxt),
    })
  } catch (e) {
    console.error('[scan:codex]', 'hooks.json', (e as Error).message.slice(0, 80))
    entries.push(invalidConfigEntry('codex-hooks-json', 'hooks.json', hooksJson, e)) // Variante A: sichtbarer Befund
  }
  const hooksDir = path.join(codexDir, 'hooks')
  for (const d of listDir(hooksDir)) {
    if (d.isFile()) {
      entries.push(fileEntry('codex-hook', hooksDir, d.name, 'global', 'Hook-Skript', true))
    } else if (d.isDirectory()) {
      entries.push(dirEntry('codex-hookgrp', hooksDir, d.name, 'global', 'Hook-Gruppe'))
      // Owner-Override #2: eine Ebene in Hook-Subdirs rekursieren, damit die
      // einzelnen Skripte (z.B. claude-mirror/*.cjs) als Eintraege auftauchen.
      const subDir = path.join(hooksDir, d.name)
      for (const f of listDir(subDir)) {
        if (f.isFile()) entries.push(fileEntry(`codex-hook-${d.name}`, subDir, f.name, 'global', `Hook-Skript (${d.name})`, true))
      }
    }
  }
  return cat('codex-hooks', 'Hooks', 'hook', hooksDir, 'hooks.json + Hook-Skripte (inkl. Subdirs)', entries)
}

// Ordner-Eintrag; bei Text-Kategorien Inhalt der Haupt-Definitionsdatei.
// WP17: GENAU 1 readFileOnce fuer die Definitionsdatei (statt descFromContent-
// Read + frontmatterKeys-Read + readPreview-Read); ohne Text (Secret/Fehler/
// > Size-Cap) bleibt der Eintrag wie bisher ohne desc/Frontmatter/code.
function scanDirEntry(prefix: string, dir: string, name: string, desc: string, withContent: boolean): ConfigEntry {
  const entry = dirEntry(prefix, dir, name, 'global', desc)
  if (!withContent) return entry
  const sub = path.join(dir, name)
  const main = listDir(sub).find(
    (d) => d.isFile() && !isSecret(d.name) && /\.(md|markdown|txt|toml|ya?ml)$/i.test(d.name),
  )
  if (!main) return entry
  const full = path.join(sub, main.name)
  const text = readFileOnce(full)?.text
  if (text === undefined) return entry
  entry.desc = descFromPreview(text, desc)
  const fmKeys = parseFrontmatterKeys(text)
  if (fmKeys.length) {
    entry.fields = { ...entry.fields, ...frontmatterFields(parseFrontmatter(text), fmKeys, inferFrontmatterArtifact(full)) }
  }
  const code = buildPreview(text, 45, 1800)
  if (code) entry.code = code
  decorateConfigEntry(entry, text, inferFrontmatterArtifact(full))
  return entry
}

// Generischer Ordner-Scanner (skills/agents/rules/plugins/teams).
// withContent surface Nicht-Secret-Inhalt fuer Text-Kategorien.
// W8-Fix rules: fileEntry-Regex erkennt jetzt auch .rules-Endung.
// B-3-Entkopplung: root + idPrefix sind jetzt PARAMETER (statt modul-lokalem
// codexDir-Binding + Hardcode-Prefix `codex-${sub}`). Default-Werte halten die
// bestehenden Codex-Aufrufer byte-/struktur-identisch (gleiche ids/Reihenfolge/
// fields); die generische Engine (engine/) ruft scanDir mit eigenem root/prefix.
// scanDirEntry/fileEntry waren bereits prefix-parametrisch — nur der `_memory`-
// Sonderfall haengt am Kategorie-Ordnernamen `sub` (unveraendert beibehalten).
function scanDir(
  id: string,
  label: string,
  icon: string,
  sub: string,
  blurb: string,
  desc: string,
  withContent = false,
  root: string = codexDir,
  idPrefix: string = `codex-${sub}`,
): Category {
  const dir = path.join(root, sub)
  const entries: ConfigEntry[] = []
  for (const d of listDir(dir)) {
    if (d.name.startsWith('.')) continue
    // _memory-Ordner ist kein Agent — als Metadaten-Ordner uebergehen
    if (d.name === '_memory' && sub === 'agents') continue
    if (d.isDirectory()) entries.push(scanDirEntry(idPrefix, dir, d.name, desc, withContent))
    else entries.push(fileEntry(idPrefix, dir, d.name, 'global', desc, withContent))
  }
  return cat(id, label, icon, dir, blurb, entries)
}

// Exportierter Wrapper fuer die generische Engine (engine/category-runner.ts):
// derselbe Ordner-Scanner, aber root + idPrefix sind PFLICHT-Parameter. Die
// Engine kennt kein codexDir-Modul-Binding; sie loest root via resolveRoots()
// auf und reicht den Manifest-/CategorySpec-Prefix durch. NULL Verhaltens-
// aenderung am Codex-Pfad: scanCodex ruft weiter scanDir mit seinen Defaults.
export function scanDirGeneric(
  id: string,
  label: string,
  icon: string,
  root: string,
  sub: string,
  blurb: string,
  desc: string,
  withContent: boolean,
  idPrefix: string,
): Category {
  return scanDir(id, label, icon, sub, blurb, desc, withContent, root, idPrefix)
}

// Exportierter Wrapper fuer den Einzel-Ordner-Drill (engine nutzt ihn fuer
// dir-Kategorien). scanDirEntry war bereits vollstaendig prefix-parametrisch
// (kein codexDir-Closure) — der Export macht ihn nur fuer die Engine erreichbar.
export { scanDirEntry }

// B-4: additive Exporte fuer die datengetriebenen Manifest-CustomCategories.
// NUR Sichtbarmachung der bespoke Bestands-Funktionen — Logik UNVERAENDERT.
// scanInstructions/scanSettings/scanHooks bauen jeweils eine FERTIGE Category.
export { scanInstructions, scanSettings, scanHooks, codexDir }

export function scanCodex(): LlmConfig {
  try {
    const categories: Category[] = [
      scanInstructions(),
      scanSettings(),
      scanHooks(),
      scanDir('codex-skills', 'Skills', 'skill', 'skills', 'codexDir/skills/*', 'Codex-Skill', true),
      scanDir('codex-agents', 'Agents', 'agent', 'agents', 'codexDir/agents/*', 'Codex-Agent-Definition', true),
      // W8-Fix rules: .rules-Dateien werden jetzt via fileEntry mit .rules-Regex erfasst
      scanDir('codex-rules', 'Rules', 'rule', 'rules', 'codexDir/rules/*', 'Codex-Rule', true),
      scanDir('codex-plugins', 'Plugins', 'plug', 'plugins', 'codexDir/plugins/*', 'Codex-Plugin'),
      // W6-Fix: Teams-Kategorie ergaenzt (~/.codex/teams/*.toml)
      scanDir('codex-teams', 'Teams', 'team', 'teams', 'codexDir/teams/*', 'Codex-Team-Konfiguration', true),
    ]
    return { categories, duplicates: [], diffLabels: CODEX_DIFF_LABELS }
  } catch (e) {
    console.error('[scan:codex]', 'fatal', (e as Error).message.slice(0, 80))
    return { categories: [], duplicates: [], diffLabels: CODEX_DIFF_LABELS }
  }
}
