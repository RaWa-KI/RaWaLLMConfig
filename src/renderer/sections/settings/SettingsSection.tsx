import { useEffect, useState } from 'react'
import { FocusNotice } from '../../components/FocusNotice'
import { Icon } from '../../components/Icon'
import { PrefsSection } from '../prefs/PrefsSection'
import { UpdateManagerProvider } from '../../state/store-update-manager'
import { UpdateManagerPanel } from '../updates/UpdateManagerPanel'
import { SourcesSection } from '../quellen/SourcesSection'
import { IntegrationsSection } from '../integrations/IntegrationsSection'
import { msg, msgText } from '../../lib/messages'
import type { MessageKey } from '@shared/messages'
import { useStore } from '../../state/store'
import { FilesPanel } from './FilesPanel'
import { readOverviewFocus } from '../overview/overview-navigation'
import { useOverviewFocusVersion } from '../overview/use-overview-focus'
import './SettingsSection.css'

type SettingsTab = 'tweaks' | 'files' | 'updates' | 'sources' | 'modules'

// Modus-Flag je Tab (WP-F6): Grundeinstellungen (tweaks) und Updates gehören
// beiden Modi; files/sources/modules bleiben Experten-Bereiche.
// Owner-Befund 2026-08-11: „Sichern und wieder einlesen" stand als Dauerblock
// über jedem Tab und hat den Erklärblock doppelt gezeigt — die Karte hat jetzt
// den eigenen Tab „Dateien" (schon vorher expert-gated, daher simple: false).
const TABS: ReadonlyArray<{ id: SettingsTab; labelKey: MessageKey; icon: string; simple: boolean }> = [
  { id: 'tweaks', labelKey: 'settings.tab.tweaks', icon: 'edit', simple: true },
  { id: 'files', labelKey: 'settings.tab.files', icon: 'save', simple: false },
  { id: 'updates', labelKey: 'settings.tab.updates', icon: 'up', simple: true },
  { id: 'sources', labelKey: 'settings.tab.sources', icon: 'folder', simple: false },
  { id: 'modules', labelKey: 'settings.tab.modules', icon: 'plug', simple: false }
]

type TabList = typeof TABS

function SettingsTabs({ tabs, tab, onTab }: { tabs: TabList; tab: SettingsTab; onTab(v: SettingsTab): void }) {
  return (
    <div className="mode-tabs settings-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          id={`settings-tab-${t.id}`}
          className={'mode-tab' + (tab === t.id ? ' on' : '')}
          onClick={() => onTab(t.id)}
        >
          {Icon[t.icon]}
          {msgText(t.labelKey)}
        </button>
      ))}
    </div>
  )
}

export function SettingsSection({ onReopenOnboarding }: { onReopenOnboarding: () => void }) {
  const { ui } = useStore()
  const expert = ui.displayMode === 'expert'
  const [tab, setTab] = useState<SettingsTab>(() => initialTab())
  // Routen-Sweep 2026-08-07: Ein Diagnose-/Flow-Klick mit settings-tab-Fokus
  // muss auch wirken, wenn die Einstellungen BEREITS offen sind — initialTab
  // liest nur beim Mount. Die Fokus-Version stoesst das Nachziehen an.
  const focusVersion = useOverviewFocusVersion()
  useEffect(() => {
    const target = focusTab(readOverviewFocus('settings')?.focusId)
    if (target) setTab(target)
  }, [focusVersion])
  // Modus-Weiche (D2, erweitert WP-F6): Simple sieht die Tabs Darstellung und
  // Updates; sources/modules bleiben Experten-Bereiche. Im Expert-Modus
  // unveraendert alle Tabs.
  const visibleTabs = expert ? TABS : TABS.filter((t) => t.simple)
  const activeTab: SettingsTab = visibleTabs.some((t) => t.id === tab) ? tab : 'tweaks'
  return (
    <section className="main settings-main">
      <div className="settings-head">
        <SettingsTabs tabs={visibleTabs} tab={activeTab} onTab={setTab} />
        <button type="button" className="btn ghost settings-onboarding" onClick={onReopenOnboarding}>
          {Icon.refresh}
          {msg('settings.reopenOnboarding')}
        </button>
      </div>
      <FocusNotice section="settings" />
      {activeTab === 'tweaks' && <PrefsSection />}
      {activeTab === 'files' && <FilesPanel />}
      {activeTab === 'updates' && (
        <UpdateManagerProvider>
          <UpdateManagerPanel />
        </UpdateManagerProvider>
      )}
      {activeTab === 'sources' && <SourcesSection />}
      {activeTab === 'modules' && <IntegrationsSection />}
    </section>
  )
}

function focusTab(focusId: string | undefined): SettingsTab | null {
  if (focusId === 'settings-tab-sources') return 'sources'
  if (focusId === 'settings-tab-modules') return 'modules'
  if (focusId === 'settings-tab-updates') return 'updates'
  if (focusId === 'settings-tab-files') return 'files'
  return null
}

function initialTab(): SettingsTab {
  return focusTab(readOverviewFocus('settings')?.focusId) ?? 'tweaks'
}
