import { useMemo, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import './PathPicker.css'

// PathPicker — durchsuchbare Zielort-/Pfad-Auswahl (Combobox) fuer den
// Verschieben-/Hinzufuegen-Flow. Filtert eine Liste bekannter Pfade (aus dem
// Store: Kategorie-Pfade + vorhandene Eintrags-Ordner) per Teilstring, mit
// Tastatur-Navigation (Pfeile/Enter/Esc) und Treffer-Hervorhebung. Freitext
// bleibt erlaubt — ein unbekannter Pfad legt das Ziel neu an.
//
// Integration (EntryActions.tsx): das freie <input className="ea-input"> durch
//   <PathPicker value={target} onChange={setTarget} options={knownPaths}
//               placeholder={open === 'add' ? 'Pfad der neuen Datei' : 'Neuer Zielpfad'}
//               onSubmit={submitTarget} />
// ersetzen. `knownPaths` z.B. aus useStore: alle Kategorie-Pfade + dirname()
// aller sichtbaren Eintraege (nie Secret-Werte), dedupliziert & sortiert.


interface PathPickerProps {
  value: string
  onChange(v: string): void
  options: string[]
  placeholder?: string
  onSubmit?(): void
  // Optional: feuert NUR bei Listen-Auswahl (Klick/Enter), nicht beim Tippen.
  // So kann der Aufrufer einen ausgewaehlten Ordnerpfad um den Dateinamen
  // ergaenzen, ohne das freie Tippen (onChange) zu stoeren. Default-Verhalten
  // ohne onSelect bleibt unveraendert (uebernimmt den rohen Treffer via onChange).
  onSelect?(path: string): void
  max?: number
}

export function PathPicker({ value, onChange, options, placeholder, onSubmit, onSelect, max = 8 }: PathPickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const q = value.trim().toLowerCase()
  const matches = useMemo(() => {
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options
    return list.slice(0, max)
  }, [q, options, max])

  function choose(p: string) {
    // Listen-Auswahl: onSelect hat Vorrang (z.B. Dateiname anhaengen);
    // ohne onSelect wie bisher den rohen Treffer uebernehmen.
    if (onSelect) onSelect(p)
    else onChange(p)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key === 'ArrowDown') { setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      if (open && matches[active]) { e.preventDefault(); choose(matches[active]) }
      else onSubmit?.()
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div className="path-picker" ref={wrapRef}>
      <span className="pp-ic">{Icon.search}</span>
      <input
        className="pp-input mono"
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <ul className="pp-list" role="listbox">
          {matches.map((p, i) => (
            <li
              key={p}
              role="option"
              aria-selected={i === active}
              className={'pp-item' + (i === active ? ' active' : '')}
              onMouseDown={(e) => { e.preventDefault(); choose(p) }}
              onMouseEnter={() => setActive(i)}
            >
              {Icon.folder}
              <Highlight text={p} q={q} />
            </li>
          ))}
        </ul>
      )}
      {open && q && matches.length === 0 && (
        <ul className="pp-list">
          <li className="pp-empty">{Icon.folder}<span>Kein bekannter Pfad — „{value}" wird neu angelegt.</span></li>
        </ul>
      )}
    </div>
  )
}

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <span className="pp-path">{text}</span>
  return (
    <span className="pp-path">
      {text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}
    </span>
  )
}
