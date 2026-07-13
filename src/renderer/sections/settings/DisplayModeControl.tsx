import type { DisplayMode } from '../../state/types'
import { msgText } from '../../lib/messages'
import { settingsExpertList } from '../../../../shared/messages/ux-copy'

interface DisplayModeControlProps {
  active: DisplayMode
  onSelect(mode: DisplayMode): void
}

export function DisplayModeControl({ active, onSelect }: DisplayModeControlProps) {
  return (
    <>
      <div className="section-switch display-mode-switch" aria-label={msgText('simpleMode.showDetails')}>
        <DisplayModeButton mode="simple" active={active} onSelect={onSelect} />
        <DisplayModeButton mode="expert" active={active} onSelect={onSelect} />
      </div>
      <p className="settings-mode-impact">
        {active === 'simple' ? msgText('simpleMode.backupHint') : msgText('expertDetails.rawDetails')}
      </p>
      {active === 'expert' && <ExpertModeDetails />}
    </>
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

function ExpertModeDetails() {
  return (
    <ul className="settings-expert-list">
      {settingsExpertList().map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}
