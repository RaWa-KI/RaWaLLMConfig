// dedupe-key.ts — Schluessel-Normalisierung fuer die Dubletten-Erkennung.
// Ausgelagert aus dedupe.ts (HR27-Split: dedupe.ts bleibt unter 300 Z).
// Beide Helfer sind rein (keine fs-Zugriffe, keine Secrets).

// normalizeCat UND normalizeKey liegen jetzt in @shared/cat-key (Single-Source
// fuer Main + Renderer; normalizeKey seit WP1 Drift-Relation); hier nur
// re-exportiert, damit bestehende Importer (coverage.ts, dedupe.ts)
// unveraendert './dedupe-key' nutzen koennen.
export { normalizeCat, normalizeKey } from '@shared/cat-key'
