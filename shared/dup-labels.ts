// dup-labels.ts — zentrale, laienverständliche UI-Texte für die Duplikat-/Aktions-Ansicht.
// Bewusst in shared/, damit Main-Scan UND Renderer dieselbe Quelle nutzen.
// Reine const-Map + kleine Helper, KEIN Electron-/React-Import
// (nur Typ-Import + Anker-Konstanten aus dem Leaf-Modul ./dup-labels-anker).
import type { DiffLabels } from './contract'
//
// Design-Wahrheit: 03-umsetzung/dup-mockups/mockup-dup-skills-v4.html (Owner-GO 15:46).
// Sprach-Prinzip (Owner 14:29): jede Aktion erklärt Quelle → Ziel → Wirkung selbst.
// Sprach-Anker: „Shared — zentrale Version" / „Claude — deine Kopie".
// VERBOTEN in sichtbaren Strings: Trunk, Mirror, Merge, M2, Spiegel, „Ordner-Vergleich" als Badge.
// Code-interne Typnamen (keep-trunk, adopt-mirror, …) bleiben unberührt — nur Texte.
//
// Seite-parametrisierte Label-Gruppen (UEBERNEHMEN/BEHALTEN/CHUNK/CONFIRM/
// UMBENENNEN/ordnerConfirm) + SECRET_PAAR liegen in ./dup-labels-seiten und
// werden hier re-exportiert — bestehende `@shared/dup-labels`-Importe bleiben gültig.
export {
  UEBERNEHMEN,
  UEBERNEHMEN_TRUNK,
  BEHALTEN,
  BEHALTEN_MIRROR,
  CHUNK,
  CONFIRM,
  UMBENENNEN,
  ordnerConfirm,
  SECRET_PAAR,
  seiteForFamily
} from './dup-labels-seiten'
export type { Seite } from './dup-labels-seiten'

// ── Sprach-Anker: SEITE + SICHERUNG ─────────────────────────────────────────
// Definitionen liegen im Leaf-Modul ./dup-labels-anker (ARCH-MITTEL-02-Fix:
// zyklenfrei, NULL Imports dort). Hier nur Re-Export — bestehende
// `@shared/dup-labels`-Importer bleiben unverändert gültig.
export { SEITE, SICHERUNG } from './dup-labels-anker'
import { SEITE } from './dup-labels-anker'

// Kurz-Anker (für Chips/Schnellwahl, wo wenig Platz ist).
export const SEITE_KURZ = {
  shared: 'Shared — zentral',
  claude: 'Claude — lokal',
  codex: 'Codex',
  beide: 'Beide Versionen'
} as const

// Kurze Spalten-/Badge-Tags (Diff-Vergleich): zentrale Quelle vs. lokale Kopie.
// Genutzt in den Scan-DiffLabels (trunkTag/mirrorTag) und der Diff-Anzeige.
export const TAG = {
  zentral: 'zentral',
  lokal: 'lokal',
  kopie: 'Kopie',
  quelle: 'Quelle'
} as const

// Sichtbare DiffLabels je Scan: zentrale Version (Shared) gegen lokale Kopie.
// Code-interne Feldnamen (trunk/mirror) bleiben unberührt — nur die angezeigten
// Texte folgen dem Sprach-Anker (Quelle → Ziel → Wirkung).
// claude/codex: lange Kopie-Anker + Tag zentral/lokal.
// workspace: generische Shared-Trunk-gegen-WS-Kopie (Tag zentral/Kopie).
export function diffLabels(seite: 'claude' | 'codex' | 'workspace'): DiffLabels {
  if (seite === 'workspace') {
    return { trunk: SEITE.shared, mirror: SEITE.workspace, trunkTag: TAG.zentral, mirrorTag: TAG.kopie }
  }
  return { trunk: SEITE.shared, mirror: SEITE[seite], trunkTag: TAG.zentral, mirrorTag: TAG.lokal }
}

// ── Status-Pills (Owner-Entscheid: ohne Null-Werte) ─────────────────────────
export const PILL = {
  same: 'identisch',
  diff: 'unterschiedlich',
  // „nur einseitig" = existiert nur auf einer Seite (z.B. nur in Claude).
  only: 'nur einseitig',
  onlyHier: 'nur hier'
} as const

// ── Eintrags-/Paar-Aktionen (UEBERNEHMEN/BEHALTEN) ──────────────────────────
// seite-parametrisiert in ./dup-labels-seiten (oben re-exportiert).

// ── Identische Paare ────────────────────────────────────────────────────────
export const IDENTISCH = {
  hinweis: 'Beide Versionen sind identisch — keine Aktion erforderlich.'
} as const

// ── Zeilen-Aktionen (Umbenennen / Verschieben pro Datei) ────────────────────
export const ZEILE = {
  umbenennenTip: 'Datei umbenennen — Seite wählbar · Sicherung vorher',
  verschiebenTip: 'Datei verschieben — beliebiger Ort · Sicherung vorher',
  mehr: 'Mehr …'
} as const

// Mini-Menü-Beschriftungen der Zeilen-Aktionen (v4 §Mehr; DupRowActions).
export const MENU = {
  umbenennen: 'Umbenennen …',
  verschieben: 'Verschieben …'
} as const

// ── Pfeil-Tooltips (CHUNK) + Umbenennen-Inline (UMBENENNEN) ─────────────────
// seite-parametrisiert in ./dup-labels-seiten (oben re-exportiert).

// ── Verschieben-Dialog ──────────────────────────────────────────────────────
export const VERSCHIEBEN = {
  titelDatei: 'Datei verschieben',
  frageWas: 'Was wird verschoben?',
  frageVersion: 'Welche Version?',
  frageWohin: 'Wohin? — Schnellwahl',
  frageZielpfad: 'Ziel-Pfad — frei anpassbar',
  zielHinweis:
    'Hier kann jeder beliebige Pfad stehen — die Datei landet genau dort, auch außerhalb der Schnellwahl.',
  // Platzhalter für das freie Zielpfad-Feld (Ordner-Reconcile reicht Pfad durch).
  zielPlatzhalter: 'Ziel-Pfad (neuer Speicherort) …',
  abbrechen: 'Abbrechen',
  bestaetigen: 'Verschieben'
} as const

// Kategorie-Chips der Schnellwahl (Familie → Kategorie → Pfad). Reihenfolge fix.
export const VERSCHIEBEN_KATEGORIEN: ReadonlyArray<{ val: string; label: string }> = [
  { val: 'skills', label: 'Skills' },
  { val: 'rules', label: 'Rules' },
  { val: 'agents', label: 'Agents' },
  { val: 'hooks', label: 'Hooks' }
]

// Wirkungszeile des Verschieben-Dialogs (Quelle → Ziel → Wirkung) als Bausatz.
// was = Anzeige-Text der Datei/des Ordners, version = Sprach-Anker der Seite,
// ziel = effektiver Zielpfad. Sicherung-Hinweis hängt der Aufrufer an.
export function verschiebenWirkung(was: string, version: string, ziel: string): string {
  return `${was} (${version}) wandert nach ${ziel}`
}

// ── Bestätigungs-Dialog (CONFIRM) ───────────────────────────────────────────
// seite-parametrisiert in ./dup-labels-seiten (oben re-exportiert).

// ── Status-Text, wenn Bearbeiten ausgeschaltet ist ──────────────────────────
export const WRITE_AUS = 'Bearbeiten ist ausgeschaltet'

// ── Speichern-Leiste des Paar-Editors (MergeBar) ────────────────────────────
// Selbsterklaerend: WO landen die Aenderungen. „verwerfen" = zurueck auf den
// geladenen Ausgangsstand (keine Datei wird geaendert). Die zwei Speichern-Knoepfe
// schreiben den jeweils bearbeiteten Editor-Inhalt in die zentrale Version (Shared,
// links) bzw. in die lokale Kopie (rechts) — Sicherung laeuft vorher automatisch.
export const SPEICHERN = {
  verwerfen: 'Änderungen verwerfen',
  // Linke Seite (Shared): in die zentrale Version speichern.
  inShared: 'In zentrale Version (Shared) speichern',
  speichert: 'Speichert …'
} as const

// Rechte Seite (lokale Kopie): „In deine Kopie (<Claude/Codex/Workspace>) speichern".
export function speichernInKopie(kopieAnker: string): string {
  return `In ${kopieAnker} speichern`
}

// ── Gekürzte Liste / Teilmengen-Hinweis (ehrliche Meldung VOR Bulk) ─────────
// Wenn die Datei-Liste gekürzt angezeigt wird, gelten Übernehmen/Behalten nur
// für die sichtbaren Dateien — nicht für den abgeschnittenen Rest.
export const TRUNCATED = {
  bulkHinweis:
    'Liste gekürzt: Übernehmen/Behalten gilt nur für die angezeigten Dateien, nicht für den Rest.'
} as const

// ── Info-Toast „schon erledigt" (Reconcile-No-op, F7-Idempotenz) ────────────
// Zweite Aktion auf ein bereits eingearbeitetes Paar ist kein Fehler, sondern
// freundlich „war schon erledigt" — keine warnende, sondern eine ruhige Meldung.
export const RECONCILE = {
  schonErledigt: 'Schon erledigt — dieser Ordner wurde bereits eingearbeitet.'
} as const

// ── Ordner-Aktionen (selbsterklärend, mit Datei-Zähler) ─────────────────────
// Owner-Korrektur 15:41: Ordner-Aktionen müssen klarmachen, dass der GANZE
// Ordner mit allen N Dateien gemeint ist. labelOrdnerAktion baut die Texte.
export interface OrdnerAktionLabel {
  titel: string
  sub: string
}

// n = Anzahl Dateien im Ordner; name = Skill-/Ordner-Name (z.B. „agent-routing").
export function labelOrdnerAktion(
  art: 'umbenennen' | 'verschieben' | 'archivieren',
  name: string,
  n: number
): OrdnerAktionLabel {
  const dateien = n === 1 ? '1 Datei' : `${n} Dateien`
  switch (art) {
    case 'umbenennen':
      return {
        titel: 'Ganzen Ordner umbenennen',
        sub: `${name} — der ganze Ordner mit allen ${dateien}`
      }
    case 'verschieben':
      return {
        titel: 'Ganzen Ordner verschieben …',
        sub: `${name} mit allen ${dateien} · Ziel frei wählbar`
      }
    case 'archivieren':
      return {
        titel: 'Ganzen Ordner archivieren',
        sub: `${name} mit allen ${dateien} wandert ins Archiv`
      }
  }
}

// ordnerConfirm (seite-parametrisiert, jetzt 'shared'|'claude'|'codex'|'workspace')
// liegt in ./dup-labels-seiten und ist oben re-exportiert.
