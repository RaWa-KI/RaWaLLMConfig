// scan-helpers.ts — Geteilte Drilldown-Hilfsfunktionen fuer scan-*.ts.
// Definitionsdatei-Drilldown: Ordner-Eintrag zeigt auf die Definitionsdatei,
// nicht auf den Ordner selbst, damit readFull + Drawer-Vorschau funktionieren.
// Read-only, kein Secret-Wert wird gelesen oder zurueckgegeben.
import fs from 'node:fs'
import path from 'node:path'
import type { ConfigEntry } from '@shared/contract'
import { isSecretPathForRead } from '../services/secret-guard'
import { MAX_SCAN_BYTES, readFileOnce } from './file-read-once'
import type { FileSnapshot } from './file-read-once'
import { maskedPreview } from './masked-preview'
import { frontmatterFields } from './frontmatter-meta'

// Liefert mtime einer Datei als ISO-Datum (YYYY-MM-DD); '' bei Fehler.
export function mtimeSafe(p: string): string {
  try {
    return fs.statSync(p).mtime.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

// Liefert Dateigroesse in KB (1 Dezimalstelle); '' bei Fehler.
export function sizeKbSafe(p: string): string {
  try {
    return (fs.statSync(p).size / 1024).toFixed(1)
  } catch {
    return ''
  }
}

// Liest Textdatei read-only; undefined bei Fehler, Secret-Pfad oder > Size-Cap.
// Size-Cap (MAX_SCAN_BYTES): gilt NUR fuer Scan-Preview/Index — der
// readFull-Drilldown liest weiterhin ungecappt; das Owner-Grundprinzip
// „alles sehen" bleibt unangetastet. Bewusste Verhaltensaenderung fuer ALLE
// Bestands-Aufrufer (claude-scan, scan-claude-plugins, drillTeam/Plugin):
// eine > 256-KB-Datei verliert Preview/zeilen/searchKeys im SCAN, bleibt aber
// via readFull voll sichtbar.
export function readTextSafe(absPath: string): string | undefined {
  if (isSecretPathForRead(absPath)) return undefined
  try {
    if (fs.statSync(absPath).size > MAX_SCAN_BYTES) return undefined
    return fs.readFileSync(absPath, 'utf8')
  } catch {
    return undefined
  }
}

// Kurze Inhaltsvorschau (max Zeilen/Zeichen); schneidet mit "... (gekuerzt)" ab.
export function buildPreview(text: string, maxLines: number, maxChars: number): string {
  const lines = text.split('\n')
  let cut = lines.length > maxLines
  let out = lines.slice(0, maxLines).join('\n')
  if (out.length > maxChars) {
    out = out.slice(0, maxChars)
    cut = true
  }
  return cut ? `${out}\n… (gekuerzt)` : out
}

// Vorschau einer Textdatei (read-only, secret-sicher); undefined wenn nicht
// lesbar oder > MAX_SCAN_BYTES (Cap kommt aus readTextSafe; nur Scan-Preview,
// readFull bleibt ungecappt).
export function readPreview(absPath: string, maxLines = 45, maxChars = 1800): string | undefined {
  const text = readTextSafe(absPath)
  if (text === undefined) return undefined
  return buildPreview(text, maxLines, maxChars)
}

// Erste echte Inhaltszeile/Ueberschrift aus Markdown-Inhalt (kein Secret).
export function firstContentLine(text: string): string {
  const body = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '')
  for (const raw of body.split('\n')) {
    const line = raw.replace(/^#+\s*/, '').trim()
    if (line) return line.length > 110 ? `${line.slice(0, 110)}…` : line
  }
  return ''
}

// YAML-Frontmatter-Keys (name/description/model/allowed-tools/tools) lesen.
export function parseFrontmatter(text: string): Record<string, string> {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(text)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line)
    if (!kv) continue
    const val = kv[2].trim().replace(/^['"]|['"]$/g, '')
    if (val) out[kv[1]] = val.length > 120 ? `${val.slice(0, 120)}…` : val
  }
  return out
}

// ── Gemeinsame Text-Helfer (fuer codex-scan + shared-scan) ───────────────

// YAML-Frontmatter-Keys (zwischen --- Markern) sammeln; [] wenn keiner gefunden.
export function parseFrontmatterKeys(text: string): string[] {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return []
  const keys: string[] = []
  for (const raw of m[1].split('\n')) {
    const k = raw.match(/^([A-Za-z0-9_-]+)\s*:/)
    if (k && keys.length < 12) keys.push(k[1])
  }
  return keys
}

// Inhaltsvorschau: max Zeilen/Zeichen; '' bei Fehler/Secret.
// isSecretFn: caller-seitige Secret-Pruefung (unterschiedlich je Scanner).
export function readPreviewSafe(
  absPath: string,
  isSecretFn: (p: string) => boolean,
  readFn: (p: string) => string,
  maxLines = 45,
  maxChars = 1800,
): string {
  try {
    if (isSecretFn(absPath)) return ''
    const txt = readFn(absPath)
    const lines = txt.split('\n')
    let cut = lines.length > maxLines
    let out = lines.slice(0, maxLines).join('\n')
    if (out.length > maxChars) { out = out.slice(0, maxChars); cut = true }
    if (!cut && lines.length > maxLines) cut = true
    return cut ? `${out}\n… (gekuerzt)` : out
  } catch {
    return ''
  }
}

// Desc aus Inhalt: Frontmatter-description > erste Ueberschrift > fallback.
export function descFromPreview(preview: string, fallback: string): string {
  if (!preview) return fallback
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(preview)
  const d = fm && fm[1].match(/^description\s*:\s*(.+)$/m)
  if (d) return d[1].replace(/^["']|["']$/g, '').trim().slice(0, 140) || fallback
  for (const raw of preview.split('\n')) {
    const h = raw.match(/^#{1,3}\s+(.+)$/)
    if (h) return h[1].trim().slice(0, 140) || fallback
  }
  return fallback
}

// Metadaten (Zeilen, Frontmatter-Keys) additiv in fields schreiben.
export function enrichFieldsFromPreview(
  fields: Record<string, string>,
  preview: string,
): void {
  if (!preview) return
  const lines = preview.split('\n')
  fields.zeilen = String(lines.length)
  const fmKeys = parseFrontmatterKeys(preview)
  const fm = parseFrontmatter(preview)
  Object.assign(fields, frontmatterFields(fm, fmKeys))
}

// Maskierte Drill-Vorschau aus dem Snapshot (WP16): liegt snap.text vor, wird
// er als raw an maskedPreview gereicht (kein Zweit-Read; maskSecrets laeuft
// trotzdem). Secret-Fall: readFileOnce liefert fuer secret-classed Pfade KEIN
// text -> raw NICHT uebergeben, maskedPreview liest dann wie bisher selbst
// (roh) und maskiert — sonst verloeren secret-classed Manifeste ihre maskierte
// Struktur-Vorschau (Owner-Override #11). Nicht-Secret ohne text (> Size-Cap/
// Lesefehler): wie bisher KEINE Vorschau (Scan-Cap; readFull bleibt ungecappt).
function drillMaskedCode(fp: string, snap: FileSnapshot): string | undefined {
  if (snap.text !== undefined) return maskedPreview(fp, 45, 1800, snap.text) || undefined
  if (isSecretPathForRead(fp)) return maskedPreview(fp) || undefined
  return undefined
}

// ── Teams-Drilldown ───────────────────────────────────────────────────────

// Teams-Verzeichnis: Definitionsdatei = config.json im Team-Unterordner.
// Felder werden aus der JSON-Struktur (keys, ohne Secret-Werte) gewonnen.
// Gibt null zurueck wenn kein config.json vorhanden.
export function drillTeamEntry(
  idPrefix: string,
  teamDir: string,
  teamName: string
): ConfigEntry | null {
  const configJson = path.join(teamDir, teamName, 'config.json')
  // WP16: GENAU 1 readFileOnce (1 stat + max. 1 Read) statt existsSync +
  // readTextSafe + sizeKbSafe + mtimeSafe (4 Syscall-Runden).
  const snap = readFileOnce(configJson)
  if (!snap) return null
  const text = snap.text
  const fields: Record<string, string> = { typ: 'config.json' }
  let desc = 'Team-Konfiguration'
  if (text) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const keys = Object.keys(parsed).filter((k) => !/token|secret|key|password|auth/i.test(k))
      if (keys.length) fields.keys = keys.slice(0, 8).join(', ')
      // Namen-/Beschreibungs-Schluessel wenn vorhanden
      const nm = typeof parsed.name === 'string' ? parsed.name : ''
      const ds = typeof parsed.description === 'string' ? parsed.description : ''
      if (nm) desc = nm.slice(0, 140)
      else if (ds) desc = ds.slice(0, 140)
    } catch {
      // Parsing-Fehler: nur Zeilenzahl
    }
    fields.zeilen = String(text.split('\n').length)
    if (snap.sizeKb) fields.groesse = snap.sizeKb
  }
  return {
    id: `${idPrefix}-${teamName}`,
    name: teamName,
    status: 'active',
    scope: 'global',
    path: configJson, // Datei, nicht Ordner -> readFull funktioniert
    desc,
    updated: snap.mtimeIso,
    fields,
    // F1-Fix: MASKIERTE Vorschau (Werte -> •••) statt Roh-buildPreview, damit
    // Team-config.json keine Tokens roh in die Drawer-Vorschau traegt.
    code: drillMaskedCode(configJson, snap),
  }
}

// ── Plugins-Drilldown ─────────────────────────────────────────────────────

// Erste .json-Datei (nicht secret) im Ordner; null wenn keine gefunden.
function findFirstJsonFallback(base: string): string | null {
  try {
    for (const d of fs.readdirSync(base, { withFileTypes: true })) {
      if (d.isFile() && d.name.endsWith('.json') && !isSecretPathForRead(d.name)) {
        return path.join(base, d.name)
      }
    }
  } catch { /* ignore */ }
  return null
}

// JSON-Keys (ohne Secret-Namen) + name/description -> fields + desc aktualisieren.
function enrichFromJson(
  text: string,
  fields: Record<string, string>,
): string | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const keys = Object.keys(parsed).filter((k) => !/token|secret|key|password|auth/i.test(k))
    if (keys.length) fields.keys = keys.slice(0, 8).join(', ')
    const nm = typeof parsed.name === 'string' ? parsed.name : ''
    const ds = typeof parsed.description === 'string' ? parsed.description : ''
    if (nm) return nm.slice(0, 140)
    if (ds) return ds.slice(0, 140)
  } catch { /* ignore */ }
  return null
}

// Plugins-Verzeichnis: Definitionsdatei = installed_plugins.json im Plugin-Unterordner.
// Felder aus JSON-Keys (keine Secret-Werte). Gibt null zurueck wenn keine Definitionsdatei.
export function drillPluginEntry(
  idPrefix: string,
  pluginsDir: string,
  pluginName: string
): ConfigEntry | null {
  const base = path.join(pluginsDir, pluginName)
  const candidates = ['installed_plugins.json', 'package.json']
  let found: string | null = null
  for (const c of candidates) {
    const fp = path.join(base, c)
    if (fs.existsSync(fp)) { found = fp; break }
  }
  if (!found) found = findFirstJsonFallback(base)
  if (!found) return null
  // WP16: GENAU 1 readFileOnce fuer die Definitionsdatei (statt readTextSafe +
  // sizeKbSafe + mtimeSafe); fields kommen aus dem Snapshot.
  const snap = readFileOnce(found)
  if (!snap) return null
  const text = snap.text
  const fields: Record<string, string> = { typ: path.basename(found) }
  let desc = 'Plugin-Konfiguration'
  if (text) {
    const fromJson = enrichFromJson(text, fields)
    if (fromJson) desc = fromJson
    fields.zeilen = String(text.split('\n').length)
    if (snap.sizeKb) fields.groesse = snap.sizeKb
  }
  return {
    id: `${idPrefix}-${pluginName}`,
    name: pluginName,
    status: 'active',
    scope: 'global',
    path: found,
    desc,
    updated: snap.mtimeIso,
    fields,
    // F1-Fix: MASKIERTE Vorschau (Werte -> •••) statt Roh-buildPreview, damit
    // installed_plugins.json/package.json keine Tokens roh in die Vorschau traegt.
    code: drillMaskedCode(found, snap),
  }
}
