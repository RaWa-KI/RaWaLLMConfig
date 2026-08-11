import { Icon } from '../../components/Icon'
import { ImportTargetDialog } from '../../components/ImportTargetDialog'
import { exportBundle, exportConflictBundle } from '../../lib/export'
import { parseImportSource, applyImportItems } from '../../lib/import'
import { knownRootsFromConfig } from '../../lib/known-roots'
import { msg, msgText } from '../../lib/messages'
import { useStore } from '../../state/store'

// FilesPanel — Tab „Dateien" (Experten-Bereich): Sichern und wieder einlesen.
// Owner-Befund 2026-08-11: die Export-/Import-Karte hing als Dauerblock ueber
// jedem Einstellungs-Tab. Sie hat jetzt einen eigenen Tab und ist damit genau
// einmal auf der Seite sichtbar. Die Fachlogik (Export, Konflikt-Export,
// Import mit Zielordner-Dialog) ist unveraendert uebernommen.

type StoreActions = ReturnType<typeof useStore>['actions']
type ImportDialog = ReturnType<typeof useStore>['ui']['importDialog']
type ConfigData = ReturnType<typeof useStore>['config']['data']

export function FilesPanel() {
  const { config, system, watcher, ui, actions } = useStore()
  const importHandlers = useImportHandlers(config.data, ui.importDialog, actions)
  return (
    <main className="main settings-files" aria-label={msgText('chrome.action.backupImportTitle')}>
      <div className="view-head">
        <div className="view-title">
          <h2>{msgText('chrome.action.backupImportTitle')}</h2>
        </div>
      </div>
      <ExportCard bundle={{ config: config.data, system: system.data, watcher: watcher.data }} actions={actions} />
      <ImportCard onImport={importHandlers.onImport} />
      {ui.importDialog && (
        <ImportTargetDialog
          items={ui.importDialog.items}
          knownRoots={ui.importDialog.knownRoots}
          onConfirm={(picks) => void importHandlers.onImportConfirm(picks)}
          onCancel={actions.closeImportDialog}
        />
      )}
    </main>
  )
}

type ExportBundle = Parameters<typeof exportBundle>[0]

function ExportCard({ bundle, actions }: { bundle: ExportBundle; actions: StoreActions }) {
  return (
    <div className="card settings-action-card">
      <div className="settings-action-head">
        <span className="prefs-ic">{Icon.save}</span>
        <h3>{msgText('chrome.action.export')}</h3>
      </div>
      <p>{msgText('chrome.action.exportTitle')}</p>
      <div className="settings-action-row">
        <button type="button" className="btn ghost sm" onClick={() => {
          exportBundle(bundle)
          actions.showToast(msgText('chrome.toast.exportCreated'), 'save')
        }}>
          {Icon.save}{msgText('chrome.action.export')}
        </button>
        <button type="button" className="btn ghost sm" onClick={() => {
          const count = exportConflictBundle(bundle)
          actions.showToast(
            count > 0 ? msg('chrome.toast.conflictsExported', { count: String(count) }) : msgText('chrome.toast.noConflicts'),
            count > 0 ? 'save' : 'check'
          )
        }}>
          {Icon.warn}{msgText('chrome.action.conflicts')}
        </button>
      </div>
    </div>
  )
}

function ImportCard({ onImport }: { onImport(file: File): Promise<void> }) {
  return (
    <div className="card settings-action-card">
      <div className="settings-action-head">
        <span className="prefs-ic">{Icon.up}</span>
        <h3>{msgText('chrome.action.import')}</h3>
      </div>
      <p>{msgText('chrome.action.importTitle')}</p>
      <div className="settings-action-row">
        <ImportFileButton onImport={onImport} />
      </div>
    </div>
  )
}

function useImportHandlers(configData: ConfigData, importDialog: ImportDialog, actions: StoreActions) {
  const onImport = async (file: File) => {
    const knownRoots = knownRootsFromConfig(configData)
    if (knownRoots.length === 0) {
      actions.showToast(msgText('chrome.toast.importNoRoots'), 'warn')
      return
    }
    const res = await parseImportSource(file, knownRoots)
    if (!res.valid) {
      actions.showToast(res.message, 'warn')
      return
    }
    actions.openImportDialog({ items: res.items, knownRoots })
  }
  const onImportConfirm = async (picks: Array<{ index: number; chosenRoot: string }>) => {
    actions.closeImportDialog()
    if (!importDialog) return
    const built = picks.map((p) => ({
      name: importDialog.items[p.index].name,
      content: importDialog.items[p.index].content,
      chosenRoot: p.chosenRoot
    }))
    const res = await applyImportItems(built)
    actions.showToast(res.message, res.ok ? 'check' : 'warn')
  }
  return { onImport, onImportConfirm }
}

function ImportFileButton({ onImport }: { onImport(file: File): Promise<void> }) {
  return (
    <label className="btn ghost sm llm-import" title={msgText('chrome.action.importTitle')}>
      {Icon.up}{msgText('chrome.action.import')}
      <input
        type="file"
        accept=".json,.md,application/json"
        className="llm-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImport(f)
          e.target.value = ''
        }}
      />
    </label>
  )
}
