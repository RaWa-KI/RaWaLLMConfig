// masked-preview.ts — maskierte Struktur-Vorschau (Owner-Override #11).
// Ausgelagert aus scan-claude-plugins.ts (F1-Fix), damit auch scan-helpers.ts
// die Maskierung nutzen kann OHNE Zirkular-Import: scan-claude-plugins.ts
// importiert buildPreview/readTextSafe/mtimeSafe aus scan-helpers.ts — ein
// Rueck-Import von maskedPreview dorthin waere zirkulaer. Diese Datei haengt
// nur an secret-mask.ts (keine scan-Imports) und ist damit zyklenfrei.
// Read-only; ein Roh-Secret-Wert wird NIE zurueckgegeben.
import fs from 'node:fs'
import { maskSecrets } from '../services/secret-mask'

// Inhaltsvorschau (lokal, ohne scan-helpers-Import, um Zyklen zu vermeiden):
// max Zeilen/Zeichen; schneidet mit "… (gekuerzt)" ab.
function cutPreview(text: string, maxLines: number, maxChars: number): string {
  const lines = text.split('\n')
  let cut = lines.length > maxLines
  let out = lines.slice(0, maxLines).join('\n')
  if (out.length > maxChars) {
    out = out.slice(0, maxChars)
    cut = true
  }
  return cut ? `${out}\n… (gekuerzt)` : out
}

// Liest eine Textdatei read-only und gibt eine MASKIERTE Vorschau (Werte ->
// •••, Keys/Struktur sichtbar). Fuer settings.json/hooks/installed_plugins.json
// die Secret-Werte enthalten koennen. NIE wird ein Roh-Wert zurueckgegeben.
// '' bei Fehler. maskSecrets vor Preview, damit Token nie roh erscheinen.
// raw (WP16, optional + rueckwaertskompatibel): bereits vorgelesener Inhalt
// (FileSnapshot.text) — dann KEIN eigenes readFileSync; maskSecrets laeuft
// unveraendert auch ueber raw (es erscheint NIE ein Roh-Wert in der Vorschau).
export function maskedPreview(absPath: string, maxLines = 45, maxChars = 1800, raw?: string): string {
  try {
    const text = raw !== undefined ? raw : fs.readFileSync(absPath, 'utf8')
    const { masked } = maskSecrets(text, absPath)
    return cutPreview(masked, maxLines, maxChars)
  } catch {
    return ''
  }
}
