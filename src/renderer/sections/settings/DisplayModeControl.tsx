import type { DisplayMode } from '../../state/types'
import { msgText } from '../../lib/messages'
import { settingsExpertList } from '../../../../shared/messages/ux-copy'
import { DisplayModeSwitch } from '../../components/DisplayModeSwitch'

interface DisplayModeControlProps {
  active: DisplayMode
  onSelect(mode: DisplayMode): void
}

// Settings-Aktionspanel: gemeinsamer Umschalter-Kern (components/DisplayModeSwitch,
// auch in der TopBar verankert) plus erklaerender Impact-Zeile und Experten-Liste.
export function DisplayModeControl({ active, onSelect }: DisplayModeControlProps) {
  return (
    <>
      <DisplayModeSwitch active={active} onSelect={onSelect} />
      <p className="settings-mode-impact">
        {active === 'simple' ? msgText('simpleMode.backupHint') : msgText('expertDetails.rawDetails')}
      </p>
      {active === 'expert' && <ExpertModeDetails />}
    </>
  )
}

function ExpertModeDetails() {
  return (
    <ul className="settings-expert-list">
      {settingsExpertList().map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}
