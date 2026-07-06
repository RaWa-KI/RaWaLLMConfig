// shared/diff-limits.ts
// Gemeinsame Diff-Grenzen fuer Renderer (diff-shared.tsx) und Main (diff-lines.ts).
// Beide Prozesse importieren von hier — eine einzige Quelle, kein Limit-Drift.

/** Maximale Zeilenzahl pro Seite vor dem LCS-Schutz-Cap (gilt fuer trunk UND mirror). */
export const DIFF_MAX_LINES = 2000

/**
 * Erkennbares Praefix fuer die Kapp-Hinweis-Zeile (ctx, both=true).
 * isOversizeFallback pruefen gegen diesen String — kein hartcodierter Literal.
 */
export const DIFF_OVERSIZE_PREFIX = '… gekappt:'
