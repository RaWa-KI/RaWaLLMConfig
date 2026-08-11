// grok-cats.ts — bespoke Kategorien fuer ~/.grok (Grok-Loader, HR16-Paritaet).
// Aufbau strikt nach kimi-cats.ts: read-only, NIE Secret-WERTE.
//   1. instructions: Startanker-Markdown liegt direkt in der Wurzel.
//   2. settings: JSON-/TOML-Einzeldateien der Wurzel — Vorschau IMMER maskiert.
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
 * Wurzel des Grok-Tool-Homes (~/.grok), sandbox-aware und OHNE eigenen
 * ConfigRoots-Schluessel: sie wird — wie kimiHome() — aus dem Elternverzeichnis
 * von configRoots().claudeHome abgeleitet. Default = reales Home, mit
 * RAWALLM_SANDBOX_ROOT = <sandbox>/.grok. Reine Funktion der Env, daher pro
 * Aufruf neu aufgeloest (kein Modul-Load-Binding). Kein absoluter Owner-Pfad.
 */
export function grokHome(): string {
  return path.join(path.dirname(configRoots().claudeHome), '.grok')
}

function cat(id: string, label: string, icon: string, p: string, blurb: string, entries: ConfigEntry[]): Category {
  return { id, label, icon, path: p, blurb, entries }
}

/** instructions: Markdown-Startanker direkt in ~/.grok. Inhalt ist normale Doku. */
export function grokInstructions(base: string): Category {
  const entries: ConfigEntry[] = []
  for (const d of listDir(base)) {
    if (!d.isFile() || !/\.md$/i.test(d.name)) continue
    entries.push(fileEntry('grok-instr', base, d.name, 'global', 'Grok-Startanker', true))
  }
  return cat('grok-instructions', 'Instructions', 'list', base, 'Startanker-Markdown aus ~/.grok', entries)
}

// Bekannte Einzeldatei-Configs der Grok-Wurzel. Dateien der Secret-Klasse
// (secret-class) werden ausschliesslich maskiert getragen.
const SETTING_FILES: readonly string[] = ['config.json', 'settings.json', 'config.toml']

// Einen Settings-Eintrag bauen. Vorschau IMMER ueber maskedPreview (Werte -> •••),
// searchKeys ueber extractSearchKeys (Keys/Sektionen, nie Werte).
function settingEntry(base: string, name: string): ConfigEntry | null {
  const full = path.join(base, name)
  if (!existsSync(full)) return null
  const secret = isSecretPathForRead(full)
  const entry: ConfigEntry = {
    id: `grok-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    status: 'active',
    scope: 'global',
    path: full,
    desc: secret ? 'Grok-Hauptconfig (nur Struktur, Werte maskiert)' : 'Grok-Konfiguration',
    updated: mtime(full),
    fields: {
      Klasse: secret ? 'Secret-Klasse — Werte maskiert' : 'Konfiguration',
      Typ: path.extname(name).replace('.', '') || 'datei',
    },
  }
  const code = maskedPreview(full, 45, 1800) || undefined
  if (code) entry.code = code
  const keys = extractSearchKeys(full)
  if (keys.length) entry.searchKeys = keys
  return entry
}

/** settings: bekannte Wurzel-Configs — Struktur/Keys, Werte maskiert. */
export function grokSettings(base: string): Category {
  const entries: ConfigEntry[] = []
  for (const name of SETTING_FILES) {
    const entry = settingEntry(base, name)
    if (entry) entries.push(entry)
  }
  return cat('grok-settings', 'Settings', 'gear', base, 'Wurzel-Config — Struktur (Werte maskiert)', entries)
}

/**
 * credentials: NUR KLASSIFIKATION, kein Inhalt. Jede Datei unterhalb von
 * `credentials/` traegt das Secret-Segment und ist damit in derselben
 * Schutzklasse wie ~/.claude/.credentials.json. Dieser Scanner oeffnet daher
 * KEINE Datei: er liest nur Ordner-Existenz, Ordner-mtime und die ANZAHL der
 * Kinder, traegt weder Dateinamen noch Vorschau noch searchKeys.
 */
export function grokCredentials(base: string): Category {
  const dir = path.join(base, 'credentials')
  const entries: ConfigEntry[] = []
  if (existsSync(dir)) {
    entries.push({
      id: 'grok-credentials',
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
  return cat('grok-credentials', 'Secrets', 'gear', dir, 'Secret-Ablage — Werte nie in Berichte/Logs, vorhandene Dateien sichtbar', entries)
}
