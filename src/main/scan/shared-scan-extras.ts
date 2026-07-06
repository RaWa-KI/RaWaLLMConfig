// shared-scan-extras.ts — Read-only Datei-/Verzeichnis-Hilfen fuer shared-scan.
// Ausgelagert aus shared-scan.ts (HR27-Split, war 307 Z > 300). Liest nur das
// Dateisystem; KEINE Secret-Werte (isSecretPathForRead-Gate vor jedem Read).
import fs from 'node:fs'
import path from 'node:path'
import { isSecretPathForRead } from '../services/secret-guard'
import { isManifestPath } from '@shared/manifest-map'
import { maskedPreview } from './masked-preview'
import { readFileOnce } from './file-read-once'
import type { FileSnapshot } from './file-read-once'

export const PREVIEW_MAX_LINES = 45
export const PREVIEW_MAX_CHARS = 1800

// Textquellen, deren Inhalt read-only als Vorschau gezeigt werden darf.
const TEXT_SRC = /\.(md|cjs|js|mjs|cts|mts|ts|py|toml|json|ya?ml|txt|sh|ps1)$/i

// True, wenn der Pfad nicht inhaltlich gelesen werden darf.
export function isSecretHint(absPath: string): boolean {
  return isSecretPathForRead(absPath)
}

// mtime einer Datei als ISO-Datum (ohne Uhrzeit/Secret); '' bei Fehler.
export function mtimeIso(p: string): string {
  try {
    return fs.statSync(p).mtime.toISOString().slice(0, 10)
  } catch {
    return ''
  }
}

// Verzeichnis-Eintraege (Dateien + Ordner) lesen; [] bei Fehlen/Fehler.
export function listDir(p: string): string[] {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

// Verzeichnis-Eintraege als Dirent (fuer Typ-Pruefung).
export function listDirents(p: string): fs.Dirent[] {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((d) => !d.name.startsWith('.'))
  } catch {
    return []
  }
}

// Anzahl der Eintraege (rekursionsfrei) in einem Ordner; 0 bei Fehler.
export function countDir(p: string): number {
  return listDir(p).length
}

// Typ ('dir'/'file') + Groesse (KB-String, nur fuer Dateien) + FileSnapshot
// eines Pfads. WP17: fuer Dateien liefert EIN readFileOnce-Snapshot Text +
// Metadaten, den die nachgelagerte Preview-/searchKeys-/updated-Kette in
// shared-scan.ts weiterverwendet (vorher eigener stat/Read je Verbraucher).
// Groessen-Format unveraendert "N.N KB" (snap.sizeKb = toFixed(1)).
// Fehler -> 'file' ohne Groesse/Snapshot (defensiv, nie werfen).
export function statKindSnap(abs: string): { kind: string; size: string; snap: FileSnapshot | null } {
  try {
    if (fs.statSync(abs).isDirectory()) return { kind: 'dir', size: '', snap: null }
  } catch {
    return { kind: 'file', size: '', snap: null }
  }
  const snap = readFileOnce(abs)
  return { kind: 'file', size: snap ? `${snap.sizeKb} KB` : '', snap }
}

// Read-only Inhaltsvorschau aus VORGELESENEM Text (WP17: Snapshot statt
// eigenem Read). Gates EXAKT wie das fruehere pfadbasierte readPreview:
// isSecretHint + TEXT_SRC. '' bei Secret/Nicht-Textquelle/fehlendem Text —
// text fehlt bei > MAX_SCAN_BYTES/Lesefehler (bewusste WP15-Cap-Folge: nur
// die SCAN-Vorschau entfaellt, readFull bleibt ungecappt).
export function previewFromText(absPath: string, text: string | undefined, maxLines: number, maxChars: number): string {
  const base = path.basename(absPath)
  if (isSecretHint(absPath) || !TEXT_SRC.test(base)) return ''
  if (text === undefined) return ''
  const lines = text.split(/\r?\n/)
  let cut = lines.length > maxLines
  let out = lines.slice(0, maxLines).join('\n')
  if (out.length > maxChars) { out = out.slice(0, maxChars); cut = true }
  return cut ? `${out}\n… (gekuerzt)` : out
}

// Definitionsdatei-Drilldown fuer Verzeichnis-Eintraege:
// Liest die primaere Definitionsdatei eines Unterordners (SKILL.md bevorzugt,
// dann Teams-/Plugins-Manifest im passenden Kontext, dann *.md/README.*).
// Teams- (config.json) und Plugins-Manifeste (plugin.json) werden NUR im
// passenden Ordner-Kontext akzeptiert — KONSISTENT zur zentralen manifest-map
// (isManifestPath: config.json nur unter teams/<seg>/, plugin.json nur unter
// plugins/<seg>/). installed_plugins.json bleibt KEIN Drill-Manifest.
// Rueckgabe (WP17 erweitert): text + mtimeIso aus DEMSELBEN Snapshot, damit
// shared-scan.ts searchKeys/updated ohne Zweit-Read/-stat befuellen kann.
export interface DrillResult { file: string; preview: string; text?: string; mtimeIso: string }

// Maskierte JSON-Drill-Vorschau — identisch zur WP16-Regel (drillMaskedCode in
// scan-helpers.ts): snap.text definiert -> als raw an maskedPreview (kein
// Zweit-Read, maskSecrets laeuft trotzdem); Secret-Pfad ohne text ->
// maskedPreview selbst lesen lassen; Nicht-Secret ohne text (> Size-Cap/
// Lesefehler) -> keine Vorschau (Scan-Cap; readFull bleibt ungecappt).
function drillJsonPreview(fp: string, snap: FileSnapshot): string {
  if (snap.text !== undefined) return maskedPreview(fp, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS, snap.text)
  if (isSecretHint(fp)) return maskedPreview(fp, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS)
  return ''
}

export function drillDirDefinition(subAbs: string): DrillResult | null {
  // Kandidaten in Prioritaetsreihenfolge. config.json/plugin.json sind generisch
  // und werden zusaetzlich gegen isManifestPath gefiltert (kontext-bewusst).
  const candidates = ['SKILL.md', 'AGENT.md', 'config.json', 'plugin.json', 'README.md', 'index.md']
  for (const c of candidates) {
    const fp = path.join(subAbs, c)
    if (!fs.existsSync(fp) || isSecretHint(fp)) continue
    // Generische Manifeste (config.json/plugin.json) nur im passenden Kontext;
    // SKILL/AGENT/README/index sind ohnehin gueltige Definitionskandidaten.
    if ((c === 'config.json' || c === 'plugin.json') && !isManifestPath(fp)) continue
    // WP17: je Treffer GENAU 1 readFileOnce (statt Read in readPreview/
    // maskedPreview + spaeterem searchKeys-Read/stat in shared-scan.ts).
    const snap = readFileOnce(fp)
    if (!snap) continue
    // config.json/plugin.json: maskierte Vorschau (Token-artige Werte -> •••).
    // Sonstige Textdateien (SKILL/AGENT/README/index.md): Roh-Preview genuegt.
    const isJson = c === 'config.json' || c === 'plugin.json'
    const preview = isJson
      ? drillJsonPreview(fp, snap)
      : previewFromText(fp, snap.text, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS)
    if (preview) return { file: fp, preview, text: snap.text, mtimeIso: snap.mtimeIso }
  }
  // Fallback: erstes *.md im Ordner (je Treffer ebenfalls 1 readFileOnce)
  for (const d of listDirents(subAbs)) {
    if (d.isFile() && /\.md$/i.test(d.name) && !isSecretHint(d.name)) {
      const fp = path.join(subAbs, d.name)
      const snap = readFileOnce(fp)
      if (!snap) continue
      const preview = previewFromText(fp, snap.text, PREVIEW_MAX_LINES, PREVIEW_MAX_CHARS)
      if (preview) return { file: fp, preview, text: snap.text, mtimeIso: snap.mtimeIso }
    }
  }
  return null
}
