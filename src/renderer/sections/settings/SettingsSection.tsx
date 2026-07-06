import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PrefsSection } from '../prefs/PrefsSection'
import { UpdateManagerProvider } from '../../state/store-update-manager'
import { UpdateManagerPanel } from '../updates/UpdateManagerPanel'
import { SourcesSection } from '../quellen/SourcesSection'
import './SettingsSection.css'

type SettingsTab = 'tweaks' | 'updates' | 'sources'

const TABS: ReadonlyArray<{ id: SettingsTab; label: string; icon: string }> = [
  { id: 'tweaks', label: 'Tweaks', icon: 'edit' },
  { id: 'updates', label: 'App-Update', icon: 'up' },
  { id: 'sources', label: 'Quellen', icon: 'folder' }
]

function SettingsTabs({ tab, onTab }: { tab: SettingsTab; onTab(v: SettingsTab): void }) {
  return (
    <div className="mode-tabs settings-tabs">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={'mode-tab' + (tab === t.id ? ' on' : '')}
          onClick={() => onTab(t.id)}
        >
          {Icon[t.icon]}
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function SettingsSection() {
  const [tab, setTab] = useState<SettingsTab>('tweaks')
  return (
    <>
      <SettingsTabs tab={tab} onTab={setTab} />
      {tab === 'tweaks' && <PrefsSection />}
      {tab === 'updates' && (
        <UpdateManagerProvider>
          <UpdateManagerPanel />
        </UpdateManagerProvider>
      )}
      {tab === 'sources' && <SourcesSection />}
    </>
  )
}
