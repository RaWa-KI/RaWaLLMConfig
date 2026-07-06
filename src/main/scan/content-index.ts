// content-index.ts — Such-Schluessel-Extraktion (Index-Fundament).
// Liefert AUSSCHLIESSLICH die Key-/Strukturseite einer Config-Datei
// (JSON Object.keys rekursiv, TOML/env links von = oder :, .md-Headings +
// Frontmatter-Keys) und VERWIRFT jede Werteseite. Es landet NIE ein Secret-WERT
// im Ergebnis — Secret-Pfade werden vor dem Parsen maskiert (maskSecrets),
// Werte werden grundsaetzlich nicht gelesen. Read-only; wirft nie. HR27.
import fs from 'node:fs'
import { readTextSafe } from './scan-helpers'
import { MAX_SCAN_BYTES } from './file-read-once'
import { isSecretPathForRead } from '../services/secret-guard'
import { isMarkdownDoc } from '@shared/secret-class'
import { maskSecrets } from '../services/secret-mask'

// Obergrenze fuer extrahierte Keys je Datei (kein unbeschraenkter Index).
const MAX_KEYS = 200

// Liest den Datei-Inhalt fuer die Key-Extraktion: Nicht-Secret roh, Secret-Pfade
// NUR maskiert (Werte -> •••, Keys/Struktur bleiben). undefined bei Fehler/zu
// gross/leer. Es wird NIE ein Roh-Secret-Wert zurueckgegeben.
function readForIndex(absPath: string): string | undefined {
  let size = 0
  try {
    size = fs.statSync(absPath).size
  } catch {
    return undefined
  }
  // Zentraler Size-Cap (MAX_SCAN_BYTES, eine Quelle in file-read-once.ts) —
  // gleicher Wert wie das fruehere lokale MAX_INDEX_BYTES.
  if (size > MAX_SCAN_BYTES || size === 0) return undefined
  if (isSecretPathForRead(absPath)) {
    // Secret-Pfad: roh lesen, sofort maskieren, nur maskierten Text zurueckgeben.
    try {
      const raw = fs.readFileSync(absPath, 'utf8')
      return maskSecrets(raw, absPath).masked
    } catch {
      return undefined
    }
  }
  return readTextSafe(absPath)
}

// JSON-Keys rekursiv sammeln (NUR Object.keys, nie Werte). Arrays werden
// durchlaufen, primitive Blattwerte komplett ignoriert.
function collectJsonKeys(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) {
    for (const el of node) collectJsonKeys(el, out)
    return
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (out.size < MAX_KEYS) out.add(k)
      collectJsonKeys(v, out)
    }
  }
}

// JSON-Pfad: parsen, nur Keys ziehen. Bei Parse-Fehler false (-> Zeilen-Pfad).
function indexJson(text: string, out: Set<string>): boolean {
  try {
    collectJsonKeys(JSON.parse(text), out)
    return true
  } catch {
    return false
  }
}

// TOML/env-Pfad: Sektions-Header [name] und Schluessel LINKS von = oder :.
// Die Werteseite (rechts) wird komplett verworfen. Kommentare/Leerzeilen skip.
function indexLines(text: string, out: Set<string>): void {
  for (const raw of text.split(/\r?\n/)) {
    if (out.size >= MAX_KEYS) break
    const line = raw.trim()
    if (line === '' || line.startsWith('#') || line.startsWith(';')) continue
    const sec = /^\[+([^\]]+)\]+/.exec(line)
    if (sec) {
      out.add(sec[1].trim())
      continue
    }
    const kv = /^([A-Za-z0-9_.-]+)\s*[=:]/.exec(line)
    if (kv) out.add(kv[1])
  }
}

// Markdown-Pfad: ATX-Headings (# .. ######) als Text + Frontmatter-Keys
// (Schluessel links von ':' im --- … --- Block). Nur Strukturseite, keine Werte.
function indexMarkdown(text: string, out: Set<string>): void {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (fm) {
    for (const raw of fm[1].split('\n')) {
      if (out.size >= MAX_KEYS) break
      const k = /^([A-Za-z0-9_-]+)\s*:/.exec(raw.trim())
      if (k) out.add(k[1])
    }
  }
  const body = fm ? text.slice(fm[0].length) : text
  for (const raw of body.split(/\r?\n/)) {
    if (out.size >= MAX_KEYS) break
    const h = /^#{1,6}\s+(.+?)\s*#*$/.exec(raw)
    if (h) out.add(h[1].trim())
  }
}

// Parse-Kern: Keys/Headings/Sektionen aus bereits vorliegendem Text ziehen.
// .md-Erkennung kommt aus @shared/secret-class (isMarkdownDoc, SSOT — WP16:
// lokales Regex-Duplikat entfernt; die Definition existiert nur noch dort).
function keysFromText(absPath: string, text: string): string[] {
  if (text.length === 0) return []
  const out = new Set<string>()
  if (isMarkdownDoc(absPath)) {
    indexMarkdown(text, out)
  } else {
    const trimmed = text.trimStart()
    const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[')
    if (!looksJson || !indexJson(text, out)) indexLines(text, out)
  }
  return [...out]
}

/**
 * Wie extractSearchKeys, aber mit optional VORGELESENEM Text (readFileOnce):
 * liegt text vor und der Pfad ist KEINE Secret-WERT-Klasse, wird direkt
 * indexiert — kein zusaetzliches Read/stat. Sonst (text undefined ODER
 * Secret-Pfad) laeuft der bisherige readForIndex-Pfad: Secret-Pfade werden
 * dort weiterhin roh gelesen + sofort maskSecrets-maskiert — UNVERAENDERT
 * (Owner-Override: Klassifikation nie verschaerfen).
 *
 * @param absPath absoluter Dateipfad.
 * @param text    vorgelesener Datei-Inhalt (z. B. FileSnapshot.text) oder undefined.
 * @returns       string[] extrahierte Keys (dedupliziert, gekappt bei MAX_KEYS).
 */
export function extractSearchKeysFromText(absPath: string, text: string | undefined): string[] {
  if (text !== undefined && !isSecretPathForRead(absPath)) {
    return keysFromText(absPath, text)
  }
  const read = readForIndex(absPath)
  if (read === undefined) return []
  return keysFromText(absPath, read)
}

/**
 * Extrahiert die SUCH-SCHLUESSEL (Key-/Strukturseite) einer Config-Datei.
 *
 * Liefert NUR Keys/Headings/Sektionen — NIE einen Wert. Secret-Pfade werden vor
 * dem Parsen maskiert (Werte -> •••), Werte werden ohnehin nicht uebernommen.
 * Read-only, wirft nie. [] bei Fehler/leer/zu gross.
 * Duenner Wrapper um extractSearchKeysFromText (ohne vorgelesenen Text).
 *
 * @param absPath absoluter Dateipfad.
 * @returns       string[] extrahierte Keys (dedupliziert, gekappt bei MAX_KEYS).
 */
export function extractSearchKeys(absPath: string): string[] {
  return extractSearchKeysFromText(absPath, undefined)
}
