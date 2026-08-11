import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { useDisplayModeSwitch } from '../../components/useDisplayModeSwitch'
import { msg, msgText } from '../../lib/messages'
import { hasUpdateBridge, readUpdateState } from '../../state/update-manager-bridge'
import { DisplayModeControl } from './DisplayModeControl'

// DisplayModeCard — Karte „Ansichtsmodus wählen" als oberster Block des
// Darstellung-Tabs (Owner-Befund 2026-08-11: das alte SettingsActionsPanel
// stand ueber JEDEM Tab und hat den Erklaerblock doppelt gezeigt). Die Karte
// gehoert damit genau einem Tab und erscheint nur einmal je Seite.
// Teilplan F: optimistischer Modus — der Schalter folgt sofort sichtbar
// demselben Zustand wie TopBar und Overview (keine Logikaenderung am Modus).
export function DisplayModeCard() {
  const { active: displayMode, onSelect: onDisplayMode } = useDisplayModeSwitch()
  return (
    <div className="card settings-action-card">
      <div className="settings-action-head">
        <span className="prefs-ic">{Icon.gear}</span>
        <h3>{msgText('simpleMode.switchGroup')}</h3>
      </div>
      <DisplayModeControl active={displayMode} onSelect={onDisplayMode} />
      <AppVersionFooter />
    </div>
  )
}

// WP-F6: sichtbare App-Version als Fusszeile der Modus-Karte (beide Modi).
// Quelle ist der bestehende Update-Kanal (updatesGetState — currentVersion =
// app.getVersion() im Main); ohne Bridge bleibt die Zeile weg.
function AppVersionFooter() {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!hasUpdateBridge('updatesGetState')) return
    let alive = true
    void readUpdateState().then((res) => {
      if (alive && res.data?.currentVersion) setVersion(res.data.currentVersion)
    })
    return () => { alive = false }
  }, [])
  if (!version) return null
  return (
    <p className="settings-app-version">
      {msg('settings.appVersion', { version })}
    </p>
  )
}
