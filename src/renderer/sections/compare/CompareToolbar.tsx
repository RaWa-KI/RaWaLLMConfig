import type { Category } from '@shared/contract'
import type { CompareCandidate } from '@shared/contract-compare'
import { useStore } from '../../state/store'
import { Icon } from '../../components/Icon'
import './CompareToolbar.css'

// CompareToolbar — Auswahl-Leiste fuer den Vergleich. Je Eintrag der Kategorie
// eine Zeile mit Checkbox (an/aus ueber compareSel). Footer-Button „Vergleichen"
// mit Zaehler, aktiv ab >=2 Auswahlen. Reine Praesentation + Store-Anbindung;
// die eigentliche Vergleichs-Auswertung loest der Aufrufer ueber onCompare aus.
// Sprache deutsch, echte Umlaute, KEINE verbotenen Begriffe (Trunk/Mirror/Merge/M2).

interface Props {
  cat: Category
  onCompare(candidates: CompareCandidate[]): void
}

export function CompareToolbar({ cat, onCompare }: Props) {
  const { ui, actions } = useStore()
  const sel = ui.compareSel

  // Auswahl -> Vergleichs-Kandidaten (in Listenreihenfolge stabil). secret bleibt
  // hier undefined; das Secret-Gate sitzt beim Laden auf der Main-Seite.
  function startCompare() {
    const candidates: CompareCandidate[] = cat.entries
      .filter((e) => sel.has(e.id))
      .map((e) => ({ id: e.id, path: e.path, label: e.name, origin: e.origin, secret: undefined }))
    onCompare(candidates)
  }

  return (
    <div className="cmp-toolbar">
      <div className="cmp-list">
        {cat.entries.map((e) => (
          <label key={e.id} className={'cmp-row' + (sel.has(e.id) ? ' on' : '')}>
            <input
              type="checkbox"
              className="cmp-check"
              checked={sel.has(e.id)}
              onChange={() => actions.toggleCompare(e.id)}
            />
            <span className="cmp-name mono">{e.name}</span>
            {e.origin && <span className="cmp-origin">{e.origin}</span>}
          </label>
        ))}
        {cat.entries.length === 0 && <div className="cmp-empty">Keine Einträge zum Vergleichen.</div>}
      </div>
      <div className="cmp-footer">
        <button
          type="button"
          className="cmp-go"
          disabled={sel.size < 2}
          onClick={startCompare}
        >
          {Icon.diff}
          Vergleichen ({sel.size})
        </button>
        <span className="cmp-hint">Mindestens zwei Einträge auswählen.</span>
      </div>
    </div>
  )
}
