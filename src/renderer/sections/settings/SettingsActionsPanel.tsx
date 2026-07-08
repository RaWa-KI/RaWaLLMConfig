import type { DisplayMode } from '../../state/types'
import { Icon } from '../../components/Icon'
import { ImportTargetDialog } from '../../components/ImportTargetDialog'
import { exportBundle, exportConflictBundle } from '../../lib/export'
import { parseImportSource, applyImportItems } from '../../lib/import'
import { knownRootsFromConfig } from '../../lib/known-roots'
import { msg, msgText } from '../../lib/messages'
import { useStore } from '../../state/store'
import { settingsExpertList } from '../../../../shared/messages/ux-copy'

type StoreActions = ReturnType<typeof useStore>['actions']
type ImportDialog = ReturnType<typeof useStore>['ui']['importDialog']
type ConfigData = ReturnType<typeof useStore>['config']['data']

export function SettingsActionsPanel() {
  const { config, system, watcher, ui, actions } = useStore()
  const importHandlers = useImportHandlers(config.data, ui.importDialog, actions)

  return (
    <>
      <section className="settings-actions" aria-label={msgText('chrome.detail.prefs')}>
        <div className="settings-action-card">
          <div className="settings-action-head">
            <span className="prefs-ic">{Icon.gear}</span>
            <h3>{msgText('settings.tab.tweaks')}</h3>
          </div>
          <DisplayModeSwitch active={ui.displayMode} onSelect={actions.setDisplayMode} />
          <p className="settings-mode-impact">
            {ui.displayMode === 'simple' ? msgText('simpleMode.backupHint') : msgText('expertDetails.rawDetails')}
          </p>
          {ui.displayMode === 'expert' && (
            <ul className="settings-expert-list">
              {settingsExpertList().map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
        <div className="settings-action-card">
          <div className="settings-action-head">
            <span className="prefs-ic">{Icon.save}</span>
            <h3>{msgText('chrome.action.backupImportTitle')}</h3>
          </div>
          <p>{msgText('chrome.action.exportTitle')}</p>
          <div className="settings-action-row">
            <button type="button" className="btn ghost sm" onClick={() => {
              exportBundle({ config: config.data, system: system.data, watcher: watcher.data })
              actions.showToast(msgText('chrome.toast.exportCreated'), 'save')
            }}>
              {Icon.save}{msgText('chrome.action.export')}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => {
              const count = exportConflictBundle({ config: config.data, system: system.data, watcher: watcher.data })
              actions.showToast(
                count > 0 ? msg('chrome.toast.conflictsExported', { count: String(count) }) : msgText('chrome.toast.noConflicts'),
                count > 0 ? 'save' : 'check'
              )
            }}>
              {Icon.warn}{msgText('chrome.action.conflicts')}
            </button>
            <ImportFileButton onImport={importHandlers.onImport} />
          </div>
          <p>{msgText('chrome.action.importTitle')}</p>
        </div>
      </section>
      {ui.importDialog && (
        <ImportTargetDialog
          items={ui.importDialog.items}
          knownRoots={ui.importDialog.knownRoots}
          onConfirm={(picks) => void importHandlers.onImportConfirm(picks)}
          onCancel={actions.closeImportDialog}
        />
      )}
    </>
  )
}

function DisplayModeSwitch(props: { active: DisplayMode; onSelect(mode: DisplayMode): void }) {
  return (
    <div className="section-switch display-mode-switch" aria-label={msgText('simpleMode.showDetails')}>
      <DisplayModeButton mode="simple" active={props.active} onSelect={props.onSelect} />
      <DisplayModeButton mode="expert" active={props.active} onSelect={props.onSelect} />
    </div>
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
