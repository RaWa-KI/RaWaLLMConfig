// dup-labels-intra.ts — ehrliche Seitenbeschriftung fuer Duplikate INNERHALB
// einer Familie (Owner-Befund P1 2026-08-07): die inhaltsbasierte Erkennung
// (dedupe-content-scan.ts, confidence 'content-hash') findet zwei Fundstellen
// DERSELBEN Familie (z. B. hooks/native-candidate-v2 vs hooks/native-candidate).
// Shared ist daran NICHT beteiligt — die Bestandslabels „Shared — zentrale
// Version" / „… — deine Kopie" waren dort faktisch falsch und irrefuehrend.
// Leaf-Modul wie dup-labels-anker: nur Typ-Import aus ./contract, kein Import
// aus dup-labels(.-seiten) — Re-Export laeuft ueber dup-labels.ts.
import type { DiffLabels, DuplicateSet } from './contract'

// Neutrale Paar-Tags (ersetzen „Quelle"/„lokal" bzw. „zentral"/„lokal"), wenn
// keine Seite die zentrale Version ist.
export const FUNDSTELLE = {
  a: 'Fundstelle A',
  b: 'Fundstelle B'
} as const

// Laienverstaendlicher Familienname fuer die Seitenbeschriftung.
export function familienName(family: string): string {
  if (family === 'claude') return 'Claude'
  if (family === 'codex') return 'Codex'
  if (family === 'shared') return 'Shared'
  if (!family) return 'Workspace'
  return family.charAt(0).toUpperCase() + family.slice(1)
}

/**
 * Intra-Familien-Duplikat? Verlaesslichstes Signal aus dem Set: die
 * inhaltsbasierte Erkennung (dedupe-content-scan.ts) setzt bei
 * confidence 'content-hash' IMMER mirrorFamily = eigene Familie — beide
 * Fundstellen entstammen derselben Familie, Shared ist nicht beteiligt.
 * Seit dem D3-Narrowing gilt dasselbe fuer die namens-/pfadbasierten Sets
 * ('named-mirror'/'heuristic'): dedupe.ts comparableConfidence() liefert bei
 * a.family !== b.family strikt null, und dedupe.ts ist der EINZIGE Erzeuger
 * dieser Confidence-Werte — auch diese Paare sind immer familienintern
 * (Folge-WP 2026-08-07, Code-Beleg dedupe.ts Cross-Familie-Guard).
 */
export function isIntraFamilyDup(
  d: Pick<DuplicateSet, 'confidence' | 'mirrorFamily'>,
  family: string
): boolean {
  const intraConfidence =
    d.confidence === 'content-hash' ||
    d.confidence === 'named-mirror' ||
    d.confidence === 'heuristic'
  return intraConfidence && d.mirrorFamily === family
}

// Pfad in Abschnitte zerlegen (Trenner '/' oder '\', leere Teile weg).
function abschnitte(p: string): string[] {
  return (p ?? '').replace(/\\/g, '/').split('/').filter((s) => s.length > 0)
}

/**
 * Erster abweichender Pfadabschnitt beider Member-Pfade: gemeinsames Praefix
 * ueberspringen (case-insensitiv, Windows-Pfade), dann je Seite den ersten
 * unterschiedlichen Abschnitt liefern (z. B. „native-candidate-v2" vs
 * „native-candidate"). Faellt eine Seite leer, greift ihr letzter Abschnitt;
 * ohne echten Unterschied neutral 'A'/'B'.
 */
export function unterscheidendeAbschnitte(pfadA: string, pfadB: string): [string, string] {
  const sa = abschnitte(pfadA)
  const sb = abschnitte(pfadB)
  let i = 0
  while (i < sa.length && i < sb.length && sa[i].toLowerCase() === sb[i].toLowerCase()) i++
  const ua = sa[i] ?? sa[sa.length - 1] ?? 'A'
  const ub = sb[i] ?? sb[sb.length - 1] ?? 'B'
  return ua.toLowerCase() === ub.toLowerCase() ? ['A', 'B'] : [ua, ub]
}

/**
 * Ehrliche DiffLabels fuer ein Intra-Familien-Paar: beide Seiten heissen nach
 * ihrer Familie plus dem tatsaechlich unterscheidenden Pfadabschnitt
 * („Claude — Fassung „native-candidate-v2""), Tags neutral Fundstelle A/B.
 * KEIN „Shared", KEINE „zentrale Version", KEINE „deine Kopie".
 */
export function intraFamilyLabels(family: string, pfadA: string, pfadB: string): DiffLabels {
  const [ua, ub] = unterscheidendeAbschnitte(pfadA, pfadB)
  const name = familienName(family)
  return {
    trunk: `${name} — Fassung „${ua}"`,
    mirror: `${name} — Fassung „${ub}"`,
    trunkTag: FUNDSTELLE.a,
    mirrorTag: FUNDSTELLE.b
  }
}

/**
 * Erkennt Intra-Familien-Labels an den neutralen Paar-Tags — erlaubt tieferen
 * Komponenten (MergeEditor-Spaltenkoepfe) die Weiche ohne Prop-Drilling.
 */
export function istIntraLabels(l: DiffLabels): boolean {
  return l.trunkTag === FUNDSTELLE.a && l.mirrorTag === FUNDSTELLE.b
}

// Fassungs-Kurzname aus einem intraFamilyLabels-Seitenlabel zurueckgewinnen
// („Claude — Fassung „x"" -> „x"). Nur fuer Labels aus intraFamilyLabels gedacht.
function fassungAusLabel(label: string): string | null {
  const i = label.indexOf('„')
  return i >= 0 && label.length > i + 2 ? label.slice(i + 1, -1) : null
}

/**
 * Beide Fassungs-Kurznamen aus fertigen Intra-Labels zurueckgewinnen — fuer
 * Komponenten, die nur DiffLabels (kein DuplicateSet) erhalten (DirFileRow,
 * MergeBar/MergeArrows). Liefert null fuer Nicht-Intra-Labels.
 */
export function intraFassungenAusLabels(l: DiffLabels): [string, string] | null {
  if (!istIntraLabels(l)) return null
  const a = fassungAusLabel(l.trunk)
  const b = fassungAusLabel(l.mirror)
  return a !== null && b !== null ? [a, b] : null
}

/**
 * Ehrlicher Intro-Satz fuer den Seite-an-Seite-Abgleich zweier Fundstellen
 * derselben Familie (ersetzt „… zentrale Version … deine Kopie …").
 */
export function intraIntroSatz(l: DiffLabels): string {
  return (
    `Seite-an-Seite-Abgleich zweier Fundstellen derselben Familie: ${l.trunk} und ${l.mirror}. ` +
    'Änderungen werden vor dem Speichern automatisch gesichert.'
  )
}
