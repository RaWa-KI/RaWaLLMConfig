import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const watcherGovernanceModule: ModuleUiDefinition = {
  id: 'watcher-governance',
  label: msg('integrations.module.watcherGovernance'),
  labelKey: 'integrations.module.watcherGovernance',
  core: false,
  defaultEnabled: false,
  probeKind: 'reports',
  icon: 'warn',
  informational: false,
  folderAction: true
}
