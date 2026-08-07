import { useSyncExternalStore } from 'react'
import { getOverviewFocusVersion, subscribeOverviewFocus } from './overview-navigation'

// Fokus-Version als React-Abo (Routen-Sweep 2026-08-07): Konsumenten des
// Overview-Fokus (ConfigSection, SystemSection, SettingsSection, FocusNotice)
// nehmen die Version in ihre Effekt-/Memo-Abhaengigkeiten auf. Damit wirkt
// eine Diagnose-/Flow-Route auch dann, wenn das Ziel in der BEREITS aktiven
// Sektion liegt — sessionStorage allein loest keinen Render aus.
export function useOverviewFocusVersion(): number {
  return useSyncExternalStore(subscribeOverviewFocus, getOverviewFocusVersion, getOverviewFocusVersion)
}
