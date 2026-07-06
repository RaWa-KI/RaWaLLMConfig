// dedupe-key.ts — Schluessel-Normalisierung fuer die Dubletten-Erkennung.
// Ausgelagert aus dedupe.ts (HR27-Split: dedupe.ts bleibt unter 300 Z).
// Beide Helfer sind rein (keine fs-Zugriffe, keine Secrets).

// normalizeCat liegt jetzt in @shared/cat-key (Single-Source fuer Main + Renderer);
// hier nur re-exportiert, damit bestehende Importer (coverage.ts, dedupe.ts)
// unveraendert './dedupe-key' nutzen koennen.
export { normalizeCat } from '@shared/cat-key'

/**
 * Normalisiert einen Dateinamen-Schluessel: entfernt bekannte Config-Endungen
 * (.md .toml .yml .yaml .json .rules), damit Codex (.toml) mit Shared (.md)
 * zusammengefuehrt wird. Trim + Lowercase fuer stabilen Vergleich.
 */
export function normalizeKey(name: string): string {
  return (name ?? '')
    .trim()
    .replace(/\.(md|toml|ya?ml|json|rules)$/i, '')
    .toLowerCase()
}
