// kimi-cats.ts — bespoke Kategorien fuer ~/.kimi-code (Kimi-Loader, HR16-Paritaet).
// Vorbild sind codex-scan.scanInstructions/scanSettings: read-only, NIE Secret-
// WERTE. Drei Sonderfaelle rechtfertigen die CustomCategory statt reiner
// CategorySpec (wie bei Claude/Codex):
//   1. instructions: AGENTS.md liegt direkt in der Wurzel (kein Unterordner).
//   2. settings: `config.toml` ist Secret-Klasse und wird von listDir() bewusst
//      ausgefiltert — der Eintrag muss (wie codex-scan.scanSettings) gezielt und
//      ausschliesslich MASKIERT gebaut werden.
//   3. credentials: wird NUR KLASSIFIZIERT. Kein Datei-Read, kein Dateiname,
//      kein Wert, keine searchKeys — nur Ordner-Metadaten (Existenz + Anzahl).
import path from 'node:path'
import { existsSync } from 'node:fs'
import type { Category, ConfigEntry } from '@shared/contract'
import { configRoots } from '../../services/config-roots'
import { isSecretPathForRead } from '../../services/secret-guard'
import { listDir, fileEntry, mtime } from '../codex-scan-helpers'
import { maskedPreview } from '../masked-preview'
import { extractSearchKeys } from '../content-index'

/**
 * Wurzel des Kimi-Tool-Homes (~/.kimi-code), sandbox-aware und OHNE eigenen
 * ConfigRoots-Schluessel: sie wird — wie der ~/.agents-Root im scan-index — aus
 * dem Elternverzeichnis von configRoots().claudeHome abgeleitet. Default = reales
 * Home, mit RAWALLM_SANDBOX_ROOT = <sandbox>/.kimi-code. Reine Funktion der Env,
 * daher pro Aufruf neu aufgeloest (kein Modul-Load-Binding).
 */
export function kimiHome(): string {
  return path.join(path.dirname(configRoots().claudeHome), '.kimi-code')
}

function cat(id: string, label: string, icon: string, p: string, blurb: string, entries: ConfigEntry[]): Category {
  return { id, label, icon, path: p, blurb, entries }
}

/**
 * instructions: Markdown-Startanker direkt in ~/.kimi-code (AGENTS.md und
 * gleichrangige Paritaets-Dokus). Inhalt ist normale Doku -> withContent.
 */
export function kimiInstructions(base: string): Category {
  const entries: ConfigEntry[] = []
  for (const d of listDir(base)) {
    if (!d.isFile() || !/\.md$/i.test(d.name)) continue
    entries.push(fileEntry('kimi-instr', base, d.name, 'global', 'Kimi-Startanker', true))
  }
  return cat('kimi-instructions', 'Instructions', 'list', base, 'Startanker AGENTS.md aus ~/.kimi-code', entries)
}

// Bekannte Einzeldatei-Configs der Kimi-Wurzel. `config.toml` ist Secret-Klasse
// (secret-class.SECRET_BASENAMES) und wird deshalb nur maskiert getragen.
const SETTING_FILES: readonly string[] = ['config.toml', 'tui.toml']

// Einen Settings-Eintrag bauen. Vorschau IMMER ueber maskedPreview (Werte -> •••),
// searchKeys ueber extractSearchKeys (Keys/Sektionen, nie Werte).
function settingEntry(base: string, name: string): ConfigEntry | null {
  const full = path.join(base, name)
  if (!existsSync(full)) return null
  const secret = isSecretPathForRead(full)
  const entry: ConfigEntry = {
    id: `kimi-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    status: 'active',
    scope: 'global',
    path: full,
    desc: secret ? 'Kimi-Hauptconfig (nur Struktur, Werte maskiert)' : 'Kimi-Oberflaechen-Config',
    updated: mtime(full),
    fields: {
      Klasse: secret ? 'Secret-Klasse — Werte maskiert' : 'Konfiguration',
      Typ: 'toml',
    },
  }
  const code = maskedPreview(full, 45, 1800) || undefined
  if (code) entry.code = code
  const keys = extractSearchKeys(full)
  if (keys.length) entry.searchKeys = keys
  return entry
}

/** settings: config.toml + tui.toml — Struktur/Keys, Werte maskiert. */
export function kimiSettings(base: string): Category {
  const entries: ConfigEntry[] = []
  for (const name of SETTING_FILES) {
    const entry = settingEntry(base, name)
    if (entry) entries.push(entry)
  }
  return cat('kimi-settings', 'Settings', 'gear', path.join(base, 'config.toml'), 'config.toml/tui.toml — Struktur (Werte maskiert)', entries)
}

/**
 * credentials: NUR KLASSIFIKATION, kein Inhalt. Jede Datei unterhalb von
 * `credentials/` traegt das Secret-Segment und ist damit in derselben
 * Schutzklasse wie ~/.claude/.credentials.json bzw. ~/.codex/auth.json
 * (secret-class.SECRET_SEGMENTS). Dieser Scanner oeffnet daher KEINE Datei:
 * er liest nur Ordner-Existenz, Ordner-mtime und die ANZAHL der Kinder
 * (readdir-Namen), traegt weder Dateinamen noch Vorschau noch searchKeys.
 * Die Owner-Sicht auf die vorhandenen Dateien (Name/Groesse/secret-Flag, NIE
 * Inhalt) laeuft separat ueber den read-only config:listDir-IPC (ipc-list.ts).
 */
export function kimiCredentials(base: string): Category {
  const dir = path.join(base, 'credentials')
  const entries: ConfigEntry[] = []
  if (existsSync(dir)) {
    entries.push({
      id: 'kimi-credentials',
      name: 'credentials',
      status: 'active',
      scope: 'global',
      path: dir,
      desc: 'Secret-Klasse — Werte werden nie in Berichte/Logs uebernommen; du siehst hier, welche Dateien vorhanden sind',
      updated: mtime(dir),
      fields: {
        Klasse: 'Secret (credentials-Segment)',
        Dateien: String(listDir(dir).length),
        Hinweis: 'Werte nie in Berichten/Logs — Dateinamen und Groesse darfst du sehen',
        Typ: 'dir',
      },
    })
  }
  return cat('kimi-credentials', 'Secrets', 'gear', dir, 'Secret-Ablage — Werte nie in Berichte/Logs, vorhandene Dateien sichtbar', entries)
}
