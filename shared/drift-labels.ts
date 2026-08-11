// drift-labels.ts — zentrale UI-Texte der Drift-Ansicht (Plan 2026-07-20, WP4).
// Muster shared/dup-labels.ts: reine const-Map + kleine Helper, KEIN
// Electron-/React-Import. Eine Drift-Relation ist eine gewollte Kopie derselben
// Datei bei mehreren Provider-Loadern (Claude/Codex/Kimi); die Ansicht zeigt,
// ob die Kopien noch gleich sind, und laesst den Nutzer festlegen, was sie ist.
import type { DriftDecision, DriftRootKind, DriftStatus } from './contract-drift'

// Abschnitt im Duplikat-Bereich der userglobal-Familie.
export const DRIFT = {
  titel: 'Drift-Relationen',
  erklaerung:
    'Eine Drift-Relation ist dieselbe Datei als gewollte Kopie bei mehreren Provider-Loadern (Claude, Codex, Kimi) — jeder Provider liest nur seinen eigenen Loader. Solche Kopien sollen gleich bleiben; weicht eine ab, lohnt ein Blick.',
  leer: 'Keine Drift-Relationen — keine Cross-Loader-Kopien gefunden.'
} as const

// Vergleichs-Status der Kopien ('same'|'diff' → Anzeige).
export const DRIFT_STATUS: Record<DriftStatus, string> = {
  same: 'gleich',
  diff: 'weicht ab'
} as const

// Heuristik-Vorschlag (nie eine Festlegung — die trifft nur der Nutzer).
export const DRIFT_VORSCHLAG = 'Vorschlag: Paritäts-Kopie' as const

// Nutzer-Festlegungen (Buttons + Badge). 'duplicate' ist die einzige Richtung,
// aus der ein Entfernen-Weg entstehen kann — darum mit Bestätigung.
export const DRIFT_DECISION: Record<DriftDecision, string> = {
  parity: 'Paritäts-Kopie',
  duplicate: 'echte Dublette',
  ignored: 'ignorieren'
} as const

// Badge-Präfix fuer eine bereits gesetzte Festlegung.
export function driftDecisionBadge(decision: DriftDecision): string {
  return `Festgelegt: ${DRIFT_DECISION[decision]}`
}

// Revidieren: der Store kennt kein Entfernen, eine neue Festlegung ersetzt
// die alte — darum heisst der Weg ehrlich „Festlegung ändern".
export const DRIFT_REVIDIEREN = {
  aendern: 'Festlegung ändern',
  hinweis: 'Eine neue Festlegung ersetzt die bisherige — jederzeit umkehrbar.'
} as const

// Ignorierte standardmaessig ausgeblendet; Schalter mit Zaehler (aria-Label der
// Gruppen-Schaltflaeche, damit Screenreader die Wirkung hoeren).
export const DRIFT_IGNORIERTE = {
  einblenden: (n: number) => `Ignorierte einblenden (${n})`,
  ausblenden: 'Ignorierte ausblenden'
} as const

// Panel-Kopf: setzt den Abschnitt klar von der Duplikat-Liste ab. Wichtig ist
// die Abgrenzung — Nutzer lasen die Drift-Relationen bisher als „noch mehr
// Duplikate, die ich aufraeumen muss" (F3).
export const DRIFT_PANEL = {
  kopf: 'Gewollte Kopien',
  abgrenzung:
    'Kein Aufräum-Thema: Diese Dateien liegen mit Absicht bei mehreren Werkzeugen gleichzeitig, weil jedes Werkzeug nur seine eigene Ablage liest. Nur wenn zwei Kopien voneinander abweichen, lohnt ein Blick.'
} as const

// Aufklappbare Gruppen: was du bereits entschieden hast, verschwindet aus der
// Standardliste und bleibt hier jederzeit nachlesbar.
export const DRIFT_GRUPPEN = {
  parityTitel: (n: number) => `Festgelegte Paritäts-Kopien (${n})`,
  parityHinweis: 'Von dir als gewollte Kopie festgelegt — hier ist nichts zu tun.',
  parityAria: (n: number) => `Festgelegte Paritäts-Kopien anzeigen (${n})`,
  ignoriertTitel: (n: number) => `Ignorierte Paare (${n})`,
  ignoriertHinweis: 'Von dir ausgeblendet — sie stehen nicht mehr in der Liste oben.',
  offenLeer: 'Nichts offen — alle gefundenen Kopien sind festgelegt oder ignoriert.'
} as const

// Loader-Root-Chips der Mitglieder. 'agents' bleibt der ~/.agents-Loader,
// 'kimi' ist der ~/.kimi-code-Loader (WP-8, B9).
export const DRIFT_ROOTKIND: Record<DriftRootKind, string> = {
  claude: 'Claude',
  codex: 'Codex',
  agents: 'Kimi (.agents)',
  kimi: 'Kimi (.kimi-code)'
} as const

// Koerper: Mitglieder + paarweiser Vergleich.
export const DRIFT_VERGLEICH = {
  mitglieder: 'Kopien',
  paarWaehlen: 'Vergleichen:',
  aktualisiert: 'geändert',
  ladet: 'Lade Inhalt …',
  geschuetzt: 'Kein Datei-Inhalt vergleichbar — geschützt oder nicht lesbar.'
} as const

// Hinweis im Eintrag, sobald 'echte Dublette' festgelegt ist.
export const DRIFT_DUPLICATE = {
  hinweis:
    'Als echte Dublette festgelegt — erst jetzt kann unten das gewählte Paar über den bestehenden Einarbeiten-Pfad bereinigt werden (mit Bestätigung und vorheriger Sicherung).',
  // Reconcile-Block (bestehender Service reconcile.ts: backup-first + Archiv).
  behaltenLinks: 'Linke Version behalten — rechte archivieren',
  behaltenRechts: 'Rechte Version behalten — linke archivieren',
  confirmTitel: 'Kopie archivieren?',
  confirmText:
    'Die gewählte Version bleibt erhalten; die andere wandert ins Archiv (nicht gelöscht). Vorher wird automatisch eine Sicherung angelegt.',
  abbrechen: 'Abbrechen',
  bestaetigen: 'Archivieren bestätigen',
  arbeitet: 'Arbeitet …'
} as const

// Fehler-/Status-Texte der Schreib-Bridge.
export const DRIFT_FEHLER = {
  bridge: 'Bridge nicht verfügbar',
  schreiben: 'Festlegung konnte nicht gespeichert werden.'
} as const
