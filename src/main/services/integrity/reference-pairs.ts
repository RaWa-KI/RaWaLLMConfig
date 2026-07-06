// reference-pairs.ts — Gemeinsame Paar-/Walk-/Skip-Logik für reference-scan
// und reference-rewrite (DRY). Keine Laufzeit-Seiteneffekte, kein Secret-Read.
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync
} from 'node:fs'
import type { Dirent, Stats } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { isSecretPathForRead } from '../secret-guard'

// ── Konstanten ────────────────────────────────────────────────────────────

export const MAX_TEXT_BYTES = 1024 * 1024

export const SKIP_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.vite'
])

export const TEXT_EXTS = new Set([
  '.cjs', '.css', '.htm', '.html', '.ini', '.js', '.json', '.jsx', '.md',
  '.mjs', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml'
])

// ── Replacement-Paar ──────────────────────────────────────────────────────

export interface ReplacementPair {
  needle: string
  replacement: string
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────

export function slashPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function jsonEscapedPath(p: string): string {
  return p.replace(/\\/g, '\\\\')
}

export function wikiName(p: string): string {
  return basename(p).replace(/\.[^.]+$/, '')
}

function addPair(
  pairs: ReplacementPair[],
  seen: Set<string>,
  needle: string,
  replacement: string
): void {
  if (!needle || needle === replacement || seen.has(needle)) return
  seen.add(needle)
  pairs.push({ needle, replacement })
}

/**
 * Baut length-sortierte old→new Ersatz-Paare:
 * JSON-escaped \\, Literal-Backslash, Slash-Form, Wikilink-Formen.
 */
export function buildPairs(oldPath: string, newPath: string): ReplacementPair[] {
  const pairs: ReplacementPair[] = []
  const seen = new Set<string>()
  addPair(pairs, seen, jsonEscapedPath(oldPath), jsonEscapedPath(newPath))
  addPair(pairs, seen, oldPath, newPath)
  addPair(pairs, seen, slashPath(oldPath), slashPath(newPath))
  const oldWiki = wikiName(oldPath)
  const newWiki = wikiName(newPath)
  addPair(pairs, seen, `[[${oldWiki}]]`, `[[${newWiki}]]`)
  addPair(pairs, seen, `[[${oldWiki}|`, `[[${newWiki}|`)
  addPair(pairs, seen, `[[${oldWiki}#`, `[[${newWiki}#`)
  return pairs.sort((a, b) => b.needle.length - a.needle.length)
}

// ── Skip-/Kandidaten-Logik ────────────────────────────────────────────────

export function safeStat(path: string): Stats | null {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

/** Ob ein Pfad ein lesbarer Text-Kandidat ist (keine Secrets, korrekte Ext). */
export function isTextCandidate(path: string): boolean {
  if (isSecretPathForRead(path)) return false
  return TEXT_EXTS.has(extname(path).toLowerCase())
}

/** Ob eine Datei eine Secret-Datei ist (für manualRequired-Klassifikation). */
export function isSecretFile(path: string): boolean {
  return isSecretPathForRead(path)
}

// ── File-Walker ───────────────────────────────────────────────────────────

/** Sammelt alle Text-Kandidaten (kein Secret-Check hier, nur Ext+SKIP_DIRS). */
export function collectFiles(root: string, out: string[]): void {
  if (!existsSync(root)) return
  const st = safeStat(root)
  if (!st) return
  if (st.isFile()) {
    if (isTextCandidate(root)) out.push(root)
    return
  }
  if (!st.isDirectory() || SKIP_DIRS.has(basename(root))) return
  let entries: Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    collectFiles(join(root, entry.name), out)
  }
}

/**
 * Sammelt ALLE Dateien (auch Secret/nicht-Text) für exhaustive Klassifikation.
 * Nutzt SKIP_DIRS, überspringt aber kein Secret (Aufrufer klassifiziert).
 */
export function collectAllFiles(root: string, out: string[]): void {
  if (!existsSync(root)) return
  const st = safeStat(root)
  if (!st) return
  if (st.isFile()) {
    out.push(root)
    return
  }
  if (!st.isDirectory() || SKIP_DIRS.has(basename(root))) return
  let entries: Dirent[]
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue
    collectAllFiles(join(root, entry.name), out)
  }
}

// ── Content-Lesen ─────────────────────────────────────────────────────────

export interface ReadResult {
  content: string
  binary: boolean
  oversize: boolean
}

/** Liest eine Textdatei; gibt binary/oversize-Flags zurück statt zu werfen. */
export function readTextFile(path: string): ReadResult | null {
  const st = safeStat(path)
  if (!st || !st.isFile()) return null
  if (st.size > MAX_TEXT_BYTES) return { content: '', binary: false, oversize: true }
  let content: string
  try {
    content = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  if (content.includes('\0')) return { content: '', binary: true, oversize: false }
  return { content, binary: false, oversize: false }
}
