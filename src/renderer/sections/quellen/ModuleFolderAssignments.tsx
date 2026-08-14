import { Icon } from '../../components/Icon'
import { useStore } from '../../state/store'
import { IntegrationCard } from '../integrations/shared/IntegrationCard'
import { useIntegrationModules } from '../integrations/useIntegrationModules'
import '../integrations/integrations.css'

// Alle Modulpfade werden hier konfiguriert. Die Modulansicht darf Funktionen
// schalten, aber keinen zweiten Ordner-Picker anbieten.
export function ModuleFolderAssignments() {
  const { modules, busyId, bridgeReady, toggle } = useIntegrationModules()
  const { ui } = useStore()
  const folderModules = modules.filter((module) => module.definition.folderAction)
  if (folderModules.length === 0) return null

  return (
    <section className="qs-module-folders" aria-labelledby="qs-module-folders-title">
      <div className="view-title">
        <h2 id="qs-module-folders-title">Ordner für optionale Module</h2>
        <p>
          Nur hier weist du optionalen Funktionen einen Ordner zu. Wähle einen Ordner nur,
          wenn du diese Funktion verwendest; ohne Auswahl bleibt sie neutral und ohne Warnung.
        </p>
      </div>
      <div className="mi-grid qs-module-grid">
        {folderModules.map((module) => (
          <IntegrationCard
            key={module.id}
            module={module}
            displayMode={ui.displayMode}
            busy={busyId === module.id}
            bridgeReady={bridgeReady}
            showFolderAction
            onToggle={(item) => void toggle(item)}
          />
        ))}
      </div>
      <p className="qs-module-footnote">{Icon.folder} Eine Ordnerauswahl aktiviert keine Cloud-Anbieter und installiert keine Software.</p>
    </section>
  )
}
