// shared/contract-compare.ts
// Typen der Vergleichs-Faehigkeit (Instructions-/Cross-File-Zeilenvergleich, Mehrfachauswahl).
// Echtes Multi-Way-Alignment per Praesenz-Maske je normalisierter Zeile ueber N Dateien
// (Q2 LOCKED 2026-06-08) — KEIN paarweise-gegen-Basis-Kern; diffLines/diffSign/diffCls bleiben
// 2-seitiger Detail-Drilldown. settings.json ist secret-bearing → Inhalt NUR maskiert getragen
// (nie roher Secret-Wert in Result/Log/Empfehlung). Ausgelagert aus contract.ts (R3, 300-Z-Limit;
// Muster wie contract-referenz.ts/contract-graph.ts). Bitmaske als boolean[] (nicht number),
// damit beliebig viele Spalten gehen (Q5 LOCKED: weiche Grenze, KEINE harte Obergrenze).

// Eine auswaehlbare Datei im Vergleich (= eine Spalte). origin = sprechende Ebene
// ("~/.claude", "Projekte (Parent)", "WS: RaWaLLMConfig") aus ConfigEntry.origin.
export interface CompareCandidate {
  id: string // stabile Auswahl-ID (Entry-ID oder Pfad)
  path: string // absoluter Dateipfad (Lade-Quelle, secret-guarded)
  label: string // sichtbarer Kurzname (Basename/Kategorie)
  origin?: string // Ebene/Ursprung (Spaltenkopf-Label)
  secret?: boolean // secret-bearing (settings.json) → Inhalt maskiert
}

// Klassifikation einer normalisierten Zeile ueber ALLE N Spalten:
//   dup     = in allen N praesent UND gleich (Dedup-Kandidat → Tokenspar)
//   partial = in >1, aber nicht allen N praesent (teilweise geteilt → Inkonsistenz)
//   unique  = nur in genau 1 Spalte praesent (Inkonsistenz)
// "gleich" zaehlt auf normalisiertem Text (CRLF/CR→LF, trailing-Newline egal).
export type MultiLineKind = 'dup' | 'partial' | 'unique'

// Eine zeilen-aligned Position im Multi-Way-Vergleich. presence[i]===true ⇔ die
// (normalisierte) Zeile ist in Spalte i vorhanden. text = normalisierter (ggf.
// maskierter) Inhalt — bei secret-bearing Spalten NIE roher Wert.
export interface MultiCompareLine {
  text: string // normalisierte (ggf. maskierte) Zeile
  presence: boolean[] // Praesenz-Maske ueber N Spalten (Laenge === columns.length)
  kind: MultiLineKind
  masked?: boolean // true = Zeile stammt aus secret-maskiertem Inhalt
}

// Pro-Spalten-Status (Lade-/Fehler-Info ohne Secret-/Pfad-Leak im Fehlerfall).
export interface CompareColumn {
  path: string // absoluter Pfad (Spaltenkopf)
  label: string // sichtbarer Kurzname
  origin?: string // Ebene/Ursprung (Spaltenkopf-Label)
  masked: boolean // Inhalt maskiert geladen (Secret-Klasse / nackter Inline-Cred)
  available: boolean // false = nicht lesbar/nicht gefunden → Platzhalter-Spalte (kein Crash)
  oversize?: boolean // Datei > Sicherheitsgrenze → gekappt/Platzhalter
}

// Aggregiertes Multi-Way-Ergebnis (IPC compare:multi). lines sind zeilen-aligned
// ueber alle Spalten; counts fuer die Tokenspar-Auswertung (Q3 = Anzeige + Empfehlung).
export interface MultiCompareResult {
  columns: CompareColumn[]
  lines: MultiCompareLine[]
  dupCount: number // Zeilen kind==='dup' (in allen N gleich → Dedup-Kandidat)
  inconsistentCount: number // Zeilen kind!=='dup' (fehlt in ≥1 oder weicht ab)
  anyMasked: boolean // mind. eine Spalte secret-maskiert
  truncated?: boolean // Zeilen-Limit (Sicherheitsgrenze) erreicht
}
