import type { MultiCompareResult } from '@shared/contract-compare'
import { Icon } from '../../components/Icon'
import './CompareSummary.css'

// CompareSummary — Tokenspar-Auswertung (WP-6b/Q3) im Slot data-wp6-slot="summary".
// Reine Anzeige + Konsolidierungs-EMPFEHLUNG: zeigt Zaehler (gemeinsam/abweichend)
// und — wenn es gemeinsame Zeilen gibt — den Hinweis, dass diese in ALLEN
// verglichenen Dateien identisch sind und damit Dedup-Kandidaten sind
// („einmal zentral behalten, Kopien auf den anderen Ebenen entfernbar").
// HR7: KEINE Mutation, KEIN Loesch-Button — der Owner entscheidet und handelt selbst.
// Secret-Schutz: nennt nur Ebenen/Labels/Zaehler, NIE Secret-Werte; bei maskierten
// Zeilen expliziter Hinweis, dass diese NICHT als Dedup-Klartext vorgeschlagen werden.

// Sprechende Ebenen-Bezeichnung einer Spalte (origin bevorzugt, sonst label).
function colName(col: { label: string; origin?: string }): string {
  return col.origin?.trim() || col.label
}

// Ebenen-Liste als lesbarer Satzteil: „A, B und C".
function joinEbenen(namen: string[]): string {
  if (namen.length <= 1) return namen[0] ?? ''
  if (namen.length === 2) return `${namen[0]} und ${namen[1]}`
  return `${namen.slice(0, -1).join(', ')} und ${namen[namen.length - 1]}`
}

// Zaehler-Zeile: „X gemeinsame Zeilen · Y abweichende" (echte Umlaute).
function CountLine({ dup, inconsistent }: { dup: number; inconsistent: number }) {
  const gemeinsam = dup === 1 ? '1 gemeinsame Zeile' : `${dup} gemeinsame Zeilen`
  const abweichend = inconsistent === 1 ? '1 abweichende' : `${inconsistent} abweichende`
  return (
    <span className="cmp-sum-counts">
      {Icon.diff}
      <strong>{gemeinsam}</strong> · {abweichend}
    </span>
  )
}

// Konsolidierungs-Empfehlung: nur wenn es gemeinsame (in ALLEN gleiche) Zeilen gibt.
// Nennt die beteiligten Ebenen, empfiehlt „einmal zentral behalten" und macht klar,
// dass die Kopien auf den anderen Ebenen entfernbar sind — der Owner entscheidet.
function Empfehlung({ result }: { result: MultiCompareResult }) {
  const verfuegbar = result.columns.filter((c) => c.available)
  const ebenen = verfuegbar.map(colName)
  const n = ebenen.length
  return (
    <div className="cmp-sum-reco" role="note">
      <span className="cmp-sum-reco-head">
        {Icon.sparkle} Konsolidieren spart Tokens
      </span>
      <p className="cmp-sum-reco-text">
        Diese <strong>{result.dupCount === 1 ? 'Zeile ist' : `${result.dupCount} Zeilen sind`}</strong>{' '}
        in {n > 1 ? `allen ${n} verglichenen Dateien` : 'der verglichenen Datei'} identisch
        {n > 1 ? <> ({joinEbenen(ebenen)})</> : null}. Du kannst sie{' '}
        <strong>einmal zentral behalten</strong> und die Kopien auf den anderen Ebenen entfernen —
        das spart Tokens bei jedem Laden. Du entscheidest und führst das selbst aus; hier wird nichts
        verändert oder gelöscht.
      </p>
      {result.anyMasked && (
        <p className="cmp-sum-masked">
          {Icon.key} Maskierte (Secret-)Zeilen sind hier <strong>nicht</strong> als Klartext-Vorschlag
          enthalten — sie werden bewusst nicht zum Entfernen empfohlen.
        </p>
      )}
    </div>
  )
}

// Kein Dedup-Potenzial: ehrlicher, ruhiger Hinweis (keine Empfehlung erzwingen).
function KeinPotenzial({ anyMasked }: { anyMasked: boolean }) {
  return (
    <div className="cmp-sum-reco cmp-sum-reco-none" role="note">
      <span className="cmp-sum-reco-text">
        {Icon.note} Keine über alle Dateien identischen Zeilen — derzeit kein Konsolidierungs-Vorschlag.
      </span>
      {anyMasked && (
        <p className="cmp-sum-masked">
          {Icon.key} Maskierte (Secret-)Zeilen werden grundsätzlich nicht als Dedup-Klartext vorgeschlagen.
        </p>
      )}
    </div>
  )
}

// < 2 lesbare Spalten: ehrlicher Hinweis statt irreführender Dedup-Empfehlung.
// (z.B. eine ausgewaehlte Datei nicht lesbar -> kein Quervergleich moeglich.)
function NurEine() {
  return (
    <div className="cmp-sum-reco cmp-sum-reco-none" role="note">
      <span className="cmp-sum-reco-text">
        {Icon.warn} Nur eine Datei ist lesbar — kein Quervergleich und kein Konsolidierungs-Vorschlag möglich.
      </span>
    </div>
  )
}

function CoveragePruefung({ anyMasked }: { anyMasked: boolean }) {
  return (
    <div className="cmp-sum-reco cmp-sum-reco-none" role="note">
      <span className="cmp-sum-reco-text">
        {Icon.note} Spiegelungs-Prüfung: Die sichtbaren Dateien werden nur verglichen.
        Fehlende oder per Plugin markierte Zellen bleiben als Kontext sichtbar.
      </span>
      {anyMasked && (
        <p className="cmp-sum-masked">
          {Icon.key} Maskierte (Secret-)Zeilen bleiben geschützt und werden nicht im Klartext gezeigt.
        </p>
      )}
    </div>
  )
}

export function CompareSummary({
  result,
  mode = 'default',
}: {
  result: MultiCompareResult
  mode?: 'default' | 'coverage'
}) {
  // Konsolidierungs-Empfehlung NUR bei >=2 lesbaren Spalten (sonst gibt es keine
  // „Kopie auf anderer Ebene" — kritiker-Auflage P2, Defense zusaetzlich zur
  // classify-Wurzel im Main-Aggregator).
  const availCols = result.columns.filter((c) => c.available).length
  const hasDedup = availCols >= 2 && result.dupCount > 0
  return (
    <div className="cmp-summary">
      <CountLine dup={result.dupCount} inconsistent={result.inconsistentCount} />
      {mode === 'coverage' ? (
        <CoveragePruefung anyMasked={result.anyMasked} />
      ) : availCols < 2 ? (
        <NurEine />
      ) : hasDedup ? (
        <Empfehlung result={result} />
      ) : (
        <KeinPotenzial anyMasked={result.anyMasked} />
      )}
    </div>
  )
}
