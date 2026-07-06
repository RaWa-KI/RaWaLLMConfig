// dup-labels-anker.ts — Leaf-Modul, von dup-labels.ts UND dem Seiten-Modul
// (dup-labels-*.ts) importiert — hier NIE etwas importieren (ARCH-MITTEL-02-Fix).
// Enthält nur die gemeinsamen Sprach-Anker-Konstanten SEITE + SICHERUNG, damit
// der frühere Wert-Import-Zyklus der beiden dup-labels-Module strukturell
// unmöglich ist (Leaf per Konstruktion, NULL Imports).

// ── Sprach-Anker: die Seiten ────────────────────────────────────────────────
export const SEITE = {
  // „Shared" = die zentrale, gemeinsame Version (Cross-WS).
  shared: 'Shared — zentrale Version',
  // „Claude" = die lokale Kopie im eigenen Workspace.
  claude: 'Claude — deine Kopie',
  // „Codex" = die lokale Codex-Kopie im eigenen Workspace.
  codex: 'Codex — deine Kopie',
  // Generische lokale Workspace-Kopie (z.B. Shared-Trunk gegen WS-Kopie).
  workspace: 'Workspace — Kopie'
} as const

// ── Sicherungs-/Backup-Hinweise (backup-first bleibt sichtbar) ──────────────
export const SICHERUNG = {
  vorher: 'Sicherung wird vorher angelegt',
  inlineHinweis: 'Sicherung wird vor jeder Änderung automatisch angelegt',
  // bewusst ohne Tech-Begriff: backup-first → „Sicherung vorher".
  snapshot: 'Sicherung vorher: Eine Kopie wird vor jeder Änderung angelegt.'
} as const
