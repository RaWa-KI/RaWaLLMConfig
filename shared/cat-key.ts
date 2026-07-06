// cat-key.ts — Kategorie-Achsen-Normalisierung, geteilt von Main + Renderer.
// Single-Source fuer den Familien-Praefix-Strip: Main baut die CoverageRow mit
// normalisiertem cat (coverage.ts), der Renderer filtert mit derselben Achse
// (ConfigSection). Frueher lag normalizeCat nur in main/services/dedupe-key.ts;
// der Renderer darf Main nicht importieren -> hierher als @shared-Modul gezogen.

// Reale Kategorie-Praefixe der Scanner (verifiziert gegen claude-/shared-/codex-/userglobal-Scan):
//   claude-scan: nackte ids (rules, skills, agents, hooks, ...)
//   shared-scan: 'shared-'-Praefix (shared-rules, shared-skills, ...)
//   codex-scan:  'codex-'-Praefix (codex-rules, codex-skills, ...)
//   userglobal: 'userglobal-claude-' / 'userglobal-codex-'
// KEIN 'claude-'/'local-'-Praefix existiert als Kategorie-id.
const CAT_PREFIX_RX = /^(shared|codex|userglobal-claude|userglobal-codex)-/

/**
 * Normalisiert eine Kategorie-id auf die familienfreie Achse, indem nur die
 * REAL existierenden Familien-Praefixe gestrippt werden.
 * So paart 'rules' <-> 'shared-rules' (gleiche Achse 'rules'), waehrend
 * 'rules' <-> 'shared-skills' NICHT paart (Achsen 'rules' vs 'skills').
 * Falschpositiv-Schutz der Kategorie-Achse bleibt erhalten.
 */
export function normalizeCat(cat: string): string {
  return (cat ?? '').trim().toLowerCase().replace(CAT_PREFIX_RX, '')
}
