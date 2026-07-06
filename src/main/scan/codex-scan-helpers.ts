// codex-scan-helpers.ts — Read-only Datei-/Eintrags-Hilfen fuer codex-scan.
// Ausgelagert aus codex-scan.ts (HR27-Split, war 307 Z > 300). Liest zur
// Laufzeit Verzeichnis-/Dateistruktur; NIE Secret-Werte (isSecret-Gate).
import fs from 'node:fs'
import path from 'node:path'
import type { ConfigEntry, Scope } from '@shared/contract'
import { isSecretPathForRead } from '../services/secret-guard'
import { parseFrontmatter, parseFrontmatterKeys, buildPreview, descFromPreview } from './scan-helpers'
import { readFileOnce } from './file-read-once'
import { extractSearchKeysFromText } from './content-index'
import { decorateConfigEntry } from './load-classifier'
import { inferFrontmatterArtifact } from './frontmatter-schema'
import { frontmatterFields } from './frontmatter-meta'

// secret-bearing-Klassifikation fuer den READ-Layer.
export function isSecret(name: string): boolean {
  return isSecretPathForRead(name)
}

export function statSafe(p: string): fs.Stats | null {
  try {
    return fs.statSync(p)
  } catch (e) {
    console.error('[scan:codex]', 'stat', (e as Error).message.slice(0, 80))
    return null
  }
}

export function mtime(p: string): string {
  const s = statSafe(p)
  return s ? s.mtime.toISOString().slice(0, 10) : ''
}

// Verzeichnis listen, Secrets ausgefiltert. Bei Fehler: leeres Array.
export function listDir(dir: string, opts?: { dirsOnly?: boolean }): fs.Dirent[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('..') && !isSecret(d.name))
      .filter((d) => (opts?.dirsOnly ? d.isDirectory() : true))
  } catch {
    return []
  }
}

// Endungen, deren Inhalt als Vorschau getragen werden darf (Owner-Override #2:
// Hook-/Skript-Endungen .cjs/.mjs/.js/.sh/.ps1 ergaenzt — Skripte sind keine
// Secret-Klasse und sollen roh sichtbar sein).
const SHOW_EXT_RX = /\.(md|markdown|txt|toml|ya?ml|rules|cjs|mjs|js|sh|ps1)$/i

function addFrontmatterFields(fields: Record<string, string>, full: string, text: string | undefined): void {
  if (text === undefined) return
  const fmKeys = parseFrontmatterKeys(text)
  if (!fmKeys.length) return
  const kind = inferFrontmatterArtifact(full)
  Object.assign(fields, frontmatterFields(parseFrontmatter(text), fmKeys, kind))
}

// Eintrag aus einer einzelnen Datei. withContent surface Nicht-Secret-Inhalt.
// WP17: GENAU 1 readFileOnce je Datei (statt sizeKb-stat + countLines-Read +
// frontmatterKeys-Read + descFromContent-Read + readPreview-Read +
// extractSearchKeys-Read/stat). snap.text fehlt bei Secret-Pfad/Lesefehler/
// > MAX_SCAN_BYTES (bewusste Cap-Folge wie WP15/16: nur SCAN-Vorschau,
// readFull bleibt ungecappt). Secret-/SHOW_EXT-Gates unveraendert.
export function fileEntry(prefix: string, dir: string, name: string, scope: Scope, desc: string, withContent = false): ConfigEntry {
  const full = path.join(dir, name)
  const snap = readFileOnce(full)
  const text = snap?.text
  const fields: Record<string, string> = {
    // FORMATFALLE: Codex-Format bleibt "N KB" (gerundet, min. 1) mit
    // '?'-Fallback — lokal aus snap.size formatiert, NICHT snap.sizeKb.
    groesse: snap ? `${Math.max(1, Math.round(snap.size / 1024))} KB` : '?',
    zeilen: text !== undefined ? String(text.split('\n').length) : '?',
    Typ: path.extname(name).slice(1) || 'file',
  }
  const show = withContent && !isSecret(name) && SHOW_EXT_RX.test(name)
  if (show) addFrontmatterFields(fields, full, text)
  const entry: ConfigEntry = {
    id: `${prefix}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    status: 'active',
    scope,
    path: full,
    desc: show && text !== undefined ? descFromPreview(text, desc) : desc,
    updated: snap?.mtimeIso ?? '',
    fields,
  }
  if (show && text !== undefined) {
    const code = buildPreview(text, 45, 1800)
    if (code) entry.code = code
  }
  decorateConfigEntry(entry, text)
  // searchKeys parallel zur Preview: Keys/Struktur (nie Werte), auch fuer
  // Secret-Pfade (text dort undefined -> content-index maskiert vor Extraktion).
  const searchKeys = extractSearchKeysFromText(full, text)
  if (searchKeys.length) entry.searchKeys = searchKeys
  return entry
}

// Eintrag aus einem Unterordner (Skill/Agent/Plugin-Verzeichnis).
export function dirEntry(prefix: string, dir: string, name: string, scope: Scope, desc: string): ConfigEntry {
  const full = path.join(dir, name)
  const children = listDir(full).length
  return {
    id: `${prefix}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    status: 'active',
    scope,
    path: full,
    desc,
    updated: mtime(full),
    fields: { Eintraege: String(children), Typ: 'dir' },
  }
}
