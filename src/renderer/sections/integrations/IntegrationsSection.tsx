import { Icon } from '../../components/Icon'
import { msg } from '../../lib/messages'
import { useStore } from '../../state/store'
import { IntegrationCard } from './shared/IntegrationCard'
import { useIntegrationModules } from './useIntegrationModules'
import './integrations.css'

export function IntegrationsSection() {
  const { modules, busyId, message, bridgeReady, toggle } = useIntegrationModules()
  const { ui } = useStore()
  return (
    <main id="settings-tab-modules" className="main mi-wrap">
      <div className="view-head">
        <div className="view-title">
          <h2>{msg('integrations.title')}</h2>
        </div>
        {message && (
          <div className="mi-message" role="status">
            {Icon.warn}
            {message}
          </div>
        )}
      </div>
      <section className="mi-grid" aria-label={msg('integrations.aria.modules')}>
        {modules.map((module) => (
          <IntegrationCard
            key={module.id}
            module={module}
            displayMode={ui.displayMode}
            busy={busyId === module.id}
            bridgeReady={bridgeReady}
            onToggle={(item) => void toggle(item)}
          />
        ))}
      </section>
    </main>
  )
}
