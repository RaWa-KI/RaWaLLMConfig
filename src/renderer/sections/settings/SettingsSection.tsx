import { useState } from 'react'
import { FocusNotice } from '../../components/FocusNotice'
import { Icon } from '../../components/Icon'
import { PrefsSection } from '../prefs/PrefsSection'
import { UpdateManagerProvider } from '../../state/store-update-manager'
import { UpdateManagerPanel } from '../updates/UpdateManagerPanel'
import { SourcesSection } from '../quellen/SourcesSection'
import { IntegrationsSection } from '../integrations/IntegrationsSection'
import { msg, msgText } from '../../lib/messages'
import type { MessageKey } from '@shared/messages'
import { SettingsActionsPanel } from './SettingsActionsPanel'
import { readOverviewFocus } from '../overview/overview-navigation'
import './SettingsSection.css'

type SettingsTab = 'tweaks' | 'updates' | 'sources' | 'modules'

const TABS: ReadonlyArray<{ id: SettingsTab; labelKey: MessageKey; icon: string }> = [
  { id: 'tweaks', labelKey: 'settings.tab.tweaks', icon: 'edit' },
  { id: 'updates', labelKey: 'settings.tab.updates', icon: 'up' },
  { id: 'sources', labelKey: 'settings.tab.sources', icon: 'folder' },
  { id: 'modules', labelKey: 'settings.tab.modules', icon: 'plug' }
]

function SettingsTabs({ tab, onTab }: { tab: SettingsTab; onTab(v: SettingsTab): void }) {
  return (
    <div className="mode-tabs settings-tabs">
      {TABS.map((t) => (
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
  const [tab, setTab] = useState<SettingsTab>(() => initialTab())
  return (
    <section className="main settings-main">
      <div className="settings-head">
        <SettingsTabs tab={tab} onTab={setTab} />
        <button type="button" className="btn ghost settings-onboarding" onClick={onReopenOnboarding}>
          {Icon.refresh}
          {msg('settings.reopenOnboarding')}
        </button>
      </div>
      <FocusNotice section="settings" />
      <SettingsActionsPanel />
      {tab === 'tweaks' && <PrefsSection />}
      {tab === 'updates' && (
        <UpdateManagerProvider>
          <UpdateManagerPanel />
        </UpdateManagerProvider>
      )}
      {tab === 'sources' && <SourcesSection />}
      {tab === 'modules' && <IntegrationsSection />}
    </section>
  )
}

function initialTab(): SettingsTab {
  const focusId = readOverviewFocus('settings')?.focusId
  if (focusId === 'settings-tab-sources') return 'sources'
  if (focusId === 'settings-tab-modules') return 'modules'
  if (focusId === 'settings-tab-updates') return 'updates'
  return 'tweaks'
}
