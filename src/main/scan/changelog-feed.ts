// changelog-feed.ts — baut den Changelog-Feed der „Pruefen"-Sektion aus den
// real abgelegten Changelog-Dateien (Metadaten aus dem Dateinamen, KEIN Volltext).
//
// HINTERGRUND (WP-7): Frueher wurde eine feste Allowlist von drei Ordnern
// gescannt und je Ordner nur die neueste Datei genommen; zusaetzlich matchte die
// Regex nur das alte Datumspraefix. Ergebnis: 0 Treffer -> ein hartcodierter
// Platzhalter-Eintrag. Jetzt: dynamisches Scannen ALLER `*-changelog`-Ordner,
// beide Namensschemata, ordneruebergreifend die N juengsten Eintraege, und bei
// leerer Quelle eine leere Liste (ehrlicher Empty-State im UI).
//
// Namensschemata (beide gueltig):
//   A) Datumspraefix  : 2026-06-04--claude-code--v2026-06-04-hooks.md
//   B) Versionspraefix: v002.001.220--2026-07-25--claude-code--v2.1.220.md
// README/Index-Dateien matchen bewusst keines der beiden Schemata und bleiben
// aus dem Feed (Navigation ist kein Changelog-Eintrag).
import fs from 'node:fs'
import path from 'node:path'
import type { WatcherChangelog } from '@shared/contract'
import { isSecretPathForRead } from '../services/secret-guard'

/** Schema A: `YYYY-MM-DD--tool--[v]version[--tag].md` (Datumspraefix, historisch). */
const DATE_PREFIX_RE =
  /^(\d{4}-\d{2}-\d{2})--([a-z0-9-]+?)--v?([0-9][0-9.]*(?:-[a-z0-9]+)*)(?:--([a-z0-9-]+))?\.md$/i

/** Schema B: `vNNN.NNN.NNN--YYYY-MM-DD--tool--[v]version[--tag].md` (real seit Rename). */
const VERSION_PREFIX_RE =
  /^v([0-9][0-9.]*)--(\d{4}-\d{2}-\d{2})--([a-z0-9-]+?)--v?([0-9][0-9.]*(?:-[a-z0-9]+)*)(?:--([a-z0-9-]+))?\.md$/i

/** Wieviele Eintraege der Feed maximal liefert (ordneruebergreifend, neueste zuerst). */
const CHANGELOG_FEED_LIMIT = 12

export interface ParsedChangelog {
  date: string
  tool: string
  version: string
  tag?: string
  sortKey: string // Versionspraefix (Schema B) bzw. Datum (Schema A) — Zweitsortierung
}

/** Dateiname gegen beide Schemata pruefen. `null` = kein Changelog-Eintrag. */
export function parseChangelogName(file: string): ParsedChangelog | null {
  const b = file.match(VERSION_PREFIX_RE)
  if (b) return { sortKey: b[1], date: b[2], tool: b[3], version: b[4], tag: b[5] }
  const a = file.match(DATE_PREFIX_RE)
  if (a) return { sortKey: a[1], date: a[1], tool: a[2], version: a[3], tag: a[4] }
  return null
}

function listMd(dir: string): string[] {
  try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md')) } catch { return [] }
}

/** Alle `*-changelog`-Ordner unterhalb der Referenz-Wurzel (dynamisch, keine Allowlist). */
function changelogDirs(referencesDir: string): string[] {
  try {
    return fs.readdirSync(referencesDir)
      .filter((d) => d.endsWith('-changelog'))
      .sort()
      .map((d) => path.join(referencesDir, d))
  } catch { return [] }
}

function toEntry(dirPath: string, file: string, p: ParsedChangelog): WatcherChangelog | null {
  const fullPath = path.join(dirPath, file)
  if (isSecretPathForRead(fullPath)) return null
  const tag = p.tag ? ` (${p.tag})` : ''
  return {
    tool: p.tool,
    version: p.version,
    date: p.date,
    summary: `Changelog-Eintrag ${p.tool} ${p.version}${tag} vom ${p.date} (lokal abgelegt).`,
    path: fullPath
  }
}

// Neueste zuerst: Datum absteigend, bei Gleichstand der Versions-/Datums-Sortkey,
// zuletzt der Dateiname — damit die Reihenfolge deterministisch bleibt.
function byNewest(a: [ParsedChangelog, string], b: [ParsedChangelog, string]): number {
  if (a[0].date !== b[0].date) return a[0].date < b[0].date ? 1 : -1
  if (a[0].sortKey !== b[0].sortKey) return a[0].sortKey < b[0].sortKey ? 1 : -1
  return a[1] < b[1] ? 1 : -1
}

/**
 * Die `limit` juengsten Changelog-Eintraege ORDNERUEBERGREIFEND. Leere/fehlende
 * Quelle -> leere Liste (nie ein erfundener Platzhalter). Dedupliziert nach
 * tool+version (stabiler Renderer-Key).
 */
export function changelogFeed(referencesDir: string, limit = CHANGELOG_FEED_LIMIT): WatcherChangelog[] {
  const found: Array<[ParsedChangelog, string, string]> = []
  for (const dirPath of changelogDirs(referencesDir)) {
    for (const file of listMd(dirPath)) {
      const p = parseChangelogName(file)
      if (p) found.push([p, file, dirPath])
    }
  }
  found.sort((a, b) => byNewest([a[0], a[1]], [b[0], b[1]]))
  const out: WatcherChangelog[] = []
  const seen = new Set<string>()
  for (const [p, file, dirPath] of found) {
    const key = `${p.tool}@${p.version}`
    if (seen.has(key)) continue
    const entry = toEntry(dirPath, file, p)
    if (!entry) continue
    seen.add(key)
    out.push(entry)
    if (out.length >= limit) break
  }
  return out
}

/** Juengstes Changelog-Datum (echter „Stand", kein Kalender-Hardcode) oder null. */
export function newestChangelogDate(referencesDir: string): string | null {
  return changelogFeed(referencesDir, 1)[0]?.date ?? null
}
