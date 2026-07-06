// dedupe-content.ts — Wiederverwendbare Einzeldatei-Inhalts-Lieferung fuer den
// Dubletten-/Vergleichs-Kern (read-only). Aus dedupe.ts ausgelagert (HR27-Split).
//
// Owner-Flow-Fix WP-D1: Bisher lieferte der Scanner nur fuer verdict=diff
// (und nur fuer NICHT-secret-Pfade) befuellte `lines`; `same`-Paare, die
// Secret-Klasse und oversize blieben leer -> der Renderer zeigte „die Haelfte".
// Diese Service-API liefert jetzt fuer JEDE Klasse vergleichbare Zeilen:
//   - same    : Inhalt EINMAL laden, alle Zeilen als ctx (both) — beide Seiten gleich.
//   - diff    : echter LCS-Zeilen-Diff (gekappt bei sehr grossen Dateien).
//   - secret  : MASKIERTE Zeilen (maskSecrets) — Anzeige maskiert, Verdict bleibt
//               aus ROH-SHA (in dedupe.ts), die Wahrheit ist der Hash, nicht die Sicht.
//   - oversize: gekappter Vergleich + truncated-Flag statt „nichts".
//
// WIEDERVERWENDBAR: der geplante Baum konsumiert spaeter dieselben Funktionen
// (compareSingleFile / loadSameContent) fuer seine Zellen — Logik NICHT im UI
// verbacken. Inhalte werden hier nur fuer den Vergleich gelesen; bei Secret-
// Klasse NUR maskiert (kein roher Secret-Wert in Ausgabe/Log).

import { readFileSync, statSync } from 'node:fs'
import type { DiffLine } from '@shared/contract'
import { diffLinesCapped } from './diff-lines'
import { isSecretPathForRead } from './secret-guard'
import { maskSecrets } from './secret-mask'

// Ergebnis der Einzeldatei-Inhalts-Lieferung (kein Secret-Wert in lines).
export interface SingleFileCompare {
  lines: DiffLine[]
  masked: boolean // true = lines sind maskiert (Secret-Klasse)
  truncated: boolean // true = gekappter Vergleich (Datei zu gross)
}

// Datei als UTF-8-Text lesen; null wenn nicht lesbar/keine Datei (graceful).
export function readText(abs: string): string | null {
  try {
    if (!statSync(abs).isFile()) return null
    return readFileSync(abs, 'utf8')
  } catch (err) {
    fail('readText', err)
    return null
  }
}

// Roh-Inhalt fuer die ANZEIGE aufbereiten. Maskierung (und damit die „nur
// ansehen"-Sperre) greift NUR bei echten Secret-WERT-Dateien
// (isSecretPathForRead: settings*.json/.env/.key/auth.json/config.toml/.pem/
// .sqlite + /credentials//security/-Segmente). Owner-Override-Grundprinzip
// ([[app-zeigt-secrets-lokal-owner-override]]): Der Owner DARF/SOLL/MUSS in
// dieser lokalen App ALLES sehen UND editieren — jede .md/README/plugin.json/
// installed_plugins.json. Eine Edit-Sperre auf eigene Nicht-Secret-Config ist ein
// BUG. Daher werden Markdown-Docs UND alle uebrigen NICHT-Secret-WERT-Dateien NIE
// ueber Inhalts-Sentinels (maskSecrets/detectCredentials) als „geschuetzt"
// markiert: ein zufaelliger langer Hash/Token im README/plugin.json darf das
// Editieren nicht sperren. Echte Secret-WERTE sind keine .md/README/plugin.json
// und werden oben via isSecretPathForRead bereits maskiert.
export function displayText(abs: string, raw: string): { text: string; masked: boolean } {
  if (isSecretPathForRead(abs)) {
    return { text: maskSecrets(raw, abs).masked, masked: true }
  }
  // Markdown-Doku (.md/.markdown/.mdx), README, plugin.json, installed_plugins.json
  // und jede sonstige Nicht-Secret-WERT-Datei: roh anzeigen + editierbar lassen
  // (kein Inhalts-Sentinel-Masking, keine „nur ansehen"-Sperre).
  return { text: raw, masked: false }
}

// Inhalt einer Seite als reine ctx-Zeilen (both) — fuer 'same'-Paare, bei denen
// beide Seiten identisch sind: einmal laden reicht. CRLF/CR/LF normalisiert,
// trailing-Newline nicht als Leerzeile. Maskiert bei Secret-Klasse.
function toCtxLines(text: string): DiffLine[] {
  const norm = text.replace(/\r\n?/g, '\n')
  const parts = norm.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop()
  return parts.map((l) => ({ l, t: 'ctx' as const, both: true }))
}

/**
 * 'same'-Paar: Inhalt EINMAL laden (beide Seiten identisch) und als ctx-Zeilen
 * liefern. Secret-Klasse -> maskiert. Liefert leere lines, wenn nicht lesbar.
 */
export function loadSameContent(trunkAbs: string, mirrorAbs: string): SingleFileCompare {
  // Bevorzugt Trunk (kanonisch); Fallback Mirror, falls Trunk nicht lesbar.
  const tRaw = readText(trunkAbs)
  const usedAbs = tRaw !== null ? trunkAbs : mirrorAbs
  const raw = tRaw ?? readText(mirrorAbs)
  if (raw === null) return { lines: [], masked: false, truncated: false }
  const { text, masked } = displayText(usedAbs, raw)
  return { lines: toCtxLines(text), masked, truncated: false }
}

/**
 * 'diff'-Paar: beide Seiten laden und einen echten LCS-Zeilen-Diff liefern.
 * Secret-Klasse (eine oder beide Seiten) -> beide Seiten MASKIERT vergleichen
 * (Anzeige maskiert; Verdict bleibt aus ROH-SHA in dedupe.ts). Grosse Dateien
 * werden gekappt (truncated=true) statt leer gelassen. Nicht lesbar -> leer.
 */
export function compareDiffContent(trunkAbs: string, mirrorAbs: string): SingleFileCompare {
  const tRaw = readText(trunkAbs)
  const mRaw = readText(mirrorAbs)
  if (tRaw === null || mRaw === null) return { lines: [], masked: false, truncated: false }
  const td = displayText(trunkAbs, tRaw)
  const md = displayText(mirrorAbs, mRaw)
  const masked = td.masked || md.masked
  const { lines, truncated } = diffLinesCapped(td.text, md.text)
  return { lines, masked, truncated }
}

/**
 * Zentrale Einzeldatei-Vergleichs-API (wiederverwendbar fuer Dubletten + Baum).
 * verdict steuert den Pfad: 'same' -> loadSameContent, 'diff' -> compareDiffContent.
 * Beide Pfade liefern fuer JEDE Klasse vergleichbare (ggf. maskierte/gekappte) Zeilen.
 */
export function compareSingleFile(
  trunkAbs: string,
  mirrorAbs: string,
  verdict: 'same' | 'diff'
): SingleFileCompare {
  return verdict === 'same'
    ? loadSameContent(trunkAbs, mirrorAbs)
    : compareDiffContent(trunkAbs, mirrorAbs)
}

// Einheitliches stderr-Logging ohne Secret-/Wert-Ausgabe.
function fail(where: string, err: unknown): void {
  console.error(`[scan:dedupe-content:${where}]`, err instanceof Error ? err.message : 'unbekannt')
}
