// parsers.ts — ParserKind -> Parser-Funktion-Map fuer die generische Scan-Engine.
// Jeder Parser nimmt EINE bereits ausgelesene Datei (FileSnapshot via readFileOnce)
// und liefert NUR die parser-spezifische Anreicherung eines ConfigEntry: desc,
// fields, code (Vorschau), searchKeys. Er bildet NIE selbst die id/scope/path —
// das macht der category-runner. Die Secret-Guard-Kette laeuft unveraendert
// DURCH: readFileOnce liest Secret-Pfade nie roh (text bleibt undefined),
// extractSearchKeysFromText maskiert Secret-Pfade vor der Key-Extraktion, und
// die Vorschau laeuft fuer Secret-Klasse ueber maskedPreview (Werte -> •••).
// Kein anbieter-spezifischer Code. Read-only, wirft nie. HR27 (<300 Z, Fn <50 Z).
import type { ParserKind } from '@shared/contract-provider'
import type { FileSnapshot } from '../file-read-once'
import { isSecretPathForRead } from '../../services/secret-guard'
import {
  parseFrontmatter,
  parseFrontmatterKeys,
  buildPreview,
  descFromPreview,
  firstContentLine,
} from '../scan-helpers'
import { frontmatterFields } from '../frontmatter-meta'
import { maskedPreview } from '../masked-preview'
import { extractSearchKeysFromText } from '../content-index'

// Vorschau-Limits (gleiche Werte wie alle Bestands-Scanner: 45 Zeilen/1800 Z).
const PREVIEW_LINES = 45
const PREVIEW_CHARS = 1800

// Das parser-spezifische Teil-Ergebnis (additiv auf das Basis-ConfigEntry).
export interface ParsedFields {
  desc?: string
  fields?: Record<string, string>
  code?: string
  searchKeys?: string[]
}

// Eine Parser-Funktion: absoluter Pfad + Snapshot + Default-desc -> Teil-Ergebnis.
export type ParserFn = (absPath: string, snap: FileSnapshot, fallbackDesc: string) => ParsedFields

// searchKeys aus dem Snapshot-Text ziehen (Keys/Struktur, nie Werte). Fuer
// Secret-Pfade ist text undefined -> content-index liest+maskiert selbst.
function keysOf(absPath: string, snap: FileSnapshot): string[] {
  return extractSearchKeysFromText(absPath, snap.text)
}

// Maskierte ODER rohe Vorschau je nach Secret-Klasse: Secret-Pfade IMMER ueber
// maskedPreview (Werte -> •••), Nicht-Secret roh via buildPreview. Ohne Text
// (> Size-Cap/Lesefehler) keine Vorschau — readFull bleibt ungecappt.
function previewOf(absPath: string, snap: FileSnapshot): string | undefined {
  if (snap.text !== undefined) return buildPreview(snap.text, PREVIEW_LINES, PREVIEW_CHARS) || undefined
  if (isSecretPathForRead(absPath)) return maskedPreview(absPath, PREVIEW_LINES, PREVIEW_CHARS) || undefined
  return undefined
}

// 'frontmatter': YAML-Frontmatter-desc/-Keys + Inhalts-Vorschau (Skills/Agents/
// Rules/Teams). desc = description-Frontmatter > erste Inhaltszeile > fallback.
function parseFrontmatterFile(absPath: string, snap: FileSnapshot, fallbackDesc: string): ParsedFields {
  const text = snap.text
  const out: ParsedFields = { fields: {} }
  if (text !== undefined) {
    const fm = parseFrontmatter(text)
    out.desc = fm.description || firstContentLine(text) || fallbackDesc
    const fmKeys = parseFrontmatterKeys(text)
    Object.assign(out.fields!, frontmatterFields(fm, fmKeys))
    out.fields!.zeilen = String(text.split('\n').length)
  }
  if (snap.sizeKb) out.fields!.groesse = snap.sizeKb
  out.code = previewOf(absPath, snap)
  const sk = keysOf(absPath, snap)
  if (sk.length) out.searchKeys = sk
  return out
}

// Key-basierte Parser (json-keys/toml-keys): nur Strukturseite + searchKeys +
// maskierte Vorschau. descFromPreview ueber die (ggf. maskierte) Vorschau.
function parseKeyedFile(absPath: string, snap: FileSnapshot, fallbackDesc: string): ParsedFields {
  const out: ParsedFields = { fields: {} }
  const code = previewOf(absPath, snap)
  out.code = code
  out.desc = code ? descFromPreview(code, fallbackDesc) : fallbackDesc
  if (snap.text !== undefined) out.fields!.zeilen = String(snap.text.split('\n').length)
  if (snap.sizeKb) out.fields!.groesse = snap.sizeKb
  const sk = keysOf(absPath, snap)
  if (sk.length) out.searchKeys = sk
  return out
}

// 'raw-preview': nur Vorschau + desc aus Vorschau, keine Frontmatter-Keys.
function parseRawPreview(absPath: string, snap: FileSnapshot, fallbackDesc: string): ParsedFields {
  const out: ParsedFields = { fields: {} }
  const code = previewOf(absPath, snap)
  out.code = code
  out.desc = code ? descFromPreview(code, fallbackDesc) : fallbackDesc
  if (snap.sizeKb) out.fields!.groesse = snap.sizeKb
  return out
}

// Map ParserKind -> ParserFn. 'dir-drill' und 'endpoint' haben KEINEN
// Einzeldatei-Parser (der runner nutzt dafuer scanDirEntry bzw. EndpointSpec
// direkt) — sie sind hier bewusst NICHT enthalten.
export const PARSERS: Partial<Record<ParserKind, ParserFn>> = {
  frontmatter: parseFrontmatterFile,
  'json-keys': parseKeyedFile,
  'toml-keys': parseKeyedFile,
  'raw-preview': parseRawPreview,
}
