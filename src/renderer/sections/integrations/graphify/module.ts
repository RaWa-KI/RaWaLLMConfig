import type { ModuleUiDefinition } from '../shared/module-model'
import { msg } from '../../../lib/messages'

export const graphifyModule: ModuleUiDefinition = {
  id: 'graphify',
  label: msg('integrations.module.graphify'),
  labelKey: 'integrations.module.graphify',
  core: false,
  defaultEnabled: false,
  probeKind: 'graph',
  icon: 'net',
  informational: false,
  folderAction: true
}
