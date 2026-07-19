import type { DisplayMode } from '../state/types'
import { msgText } from '../lib/messages'

// Kompakter simple/expert-Umschalter — gemeinsamer Kern von
// settings/DisplayModeControl (Settings-Aktionspanel) und dem TopBar-Schalter
// (Owner-Entscheid D1, 2026-07-18: Modus-Umschalter sichtbar verankern).
// Keine zusaetzlichen Texte/Listen hier; Erlaeuterungen bleiben dem
// jeweiligen Einbindungs-Kontext ueberlassen.
interface DisplayModeSwitchProps {
  active: DisplayMode
  onSelect(mode: DisplayMode): void
}

export function DisplayModeSwitch({ active, onSelect }: DisplayModeSwitchProps) {
  return (
    <div className="section-switch display-mode-switch" role="group" aria-label={msgText('simpleMode.switchGroup')}>
      <DisplayModeButton mode="simple" active={active} onSelect={onSelect} />
      <DisplayModeButton mode="expert" active={active} onSelect={onSelect} />
    </div>
  )
}

function DisplayModeButton(props: { mode: DisplayMode; active: DisplayMode; onSelect(mode: DisplayMode): void }) {
  const label = props.mode === 'simple' ? msgText('simpleMode.label') : msgText('expertDetails.label')
  return (
    <button
      type="button"
      className={'sec-btn compact' + (props.active === props.mode ? ' on' : '')}
      onClick={() => props.onSelect(props.mode)}
      aria-pressed={props.active === props.mode}
    >
      {label}
    </button>
  )
}
