import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const workspaceRegistryModule: ModuleUiDefinition = {
  id: 'workspace-registry',
  label: msg('integrations.module.workspaceRegistry'),
  labelKey: 'integrations.module.workspaceRegistry',
  core: false,
  defaultEnabled: false,
  probeKind: 'registry',
  icon: 'map',
  informational: false,
  folderAction: true
}
