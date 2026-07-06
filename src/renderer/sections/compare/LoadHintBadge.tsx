import { classifyLoad, loadWhenLabel, type LoadHint, type LoadWhen } from './load-semantics'
import './LoadHintBadge.css'

// LoadHintBadge (WP-6a / Q7) — kompaktes Chip im Spaltenkopf, das zeigt WANN/WIE
// die Datei vom Tool geladen wird (immer / bei Bedarf / bedingt) + per title-Tooltip
// den Owner-Steuerungs-Hinweis und die doc-belegte Quelle. Reine Anzeige, kein
// Reveal, keine Werte. Akzeptiert entweder einen fertigen hint ODER path/origin
// (dann wird intern klassifiziert). Deutsche Texte, echte Umlaute.

// when -> CSS-Modifier (Akzentfarbe). „immer" sticht hervor (Tokenspar-Warnung);
// „beim Arbeiten hier" ist ruhiger Info-Akzent (Workspace-Load ist KEIN Alarm).
const WHEN_CLASS: Record<LoadWhen, string> = {
  immer: 'lh-always',
  'beim Arbeiten hier': 'lh-wsload',
  'bei Bedarf': 'lh-ondemand',
  bedingt: 'lh-conditional'
}

// Kurz-Label im Chip (laienverstaendliche Anzeige aus loadWhenLabel; interne
// LoadWhen-Werte bleiben Keys).
function chipLabel(when: LoadWhen): string {
  return loadWhenLabel(when)
}

// Tooltip-Text: Steuerungs-Hinweis + Quelle (kein Wert, kein Pfad-Leak).
function tooltip(hint: LoadHint): string {
  return `${loadWhenLabel(hint.when)}. ${hint.control} (Quelle: ${hint.source})`
}

type Props = { hint: LoadHint } | { path: string; origin?: string }

export function LoadHintBadge(props: Props) {
  const hint =
    'hint' in props ? props.hint : classifyLoad(props.path, props.origin)
  return (
    <span
      className={'lh-badge ' + WHEN_CLASS[hint.when]}
      title={tooltip(hint)}
    >
      <span className="lh-dot" aria-hidden="true" />
      {chipLabel(hint.when)}
    </span>
  )
}
